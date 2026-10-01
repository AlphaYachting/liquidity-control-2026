// Der EINE Posteingang: unbeantwortete Kundenkonversationen aus dem Verlaufs-Index
// (needs_reply, vom Backend auf Konversationsebene berechnet) plus die KI-Einordnung
// aus dem CRM-Posteingang (CrmInboxItem) und Anfragen ohne E-Mail (Telefon-KI, manuell).
import { isBlockedSender } from '@/lib/crm/blockedSenders';
import { threadIdOf } from '@/components/crm/inboxDecision';

export const SCHWELLE_ARBEITSSTUNDEN = 4;
export const ARBEITSZEIT = { von: 8, bis: 17 }; // Mo–Fr, Ortszeit Wien
export const POSTEINGANG_TAGE = 30;
export const UEBERFAELLIG_STUNDEN = 48;

const SCHRITT = 15 * 60 * 1000;

// "2026-10-01 08:23:22" (UTC aus der E-Mail-DB) oder ISO -> Millisekunden
export function toTime(s) {
  if (!s) return 0;
  const str = String(s);
  const t = new Date(str.includes('T') ? str : str.slice(0, 19).replace(' ', 'T') + 'Z').getTime();
  return Number.isNaN(t) ? 0 : t;
}

const wienFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Vienna', weekday: 'short', hour: '2-digit', hourCycle: 'h23',
});
const slotCache = new Map();
function istArbeitszeit(slotStart) {
  if (slotCache.has(slotStart)) return slotCache.get(slotStart);
  const teile = wienFormat.formatToParts(new Date(slotStart));
  const tag = teile.find((p) => p.type === 'weekday')?.value;
  const stunde = Number(teile.find((p) => p.type === 'hour')?.value);
  const ja = tag !== 'Sat' && tag !== 'Sun' && stunde >= ARBEITSZEIT.von && stunde < ARBEITSZEIT.bis;
  if (slotCache.size > 20000) slotCache.clear();
  slotCache.set(slotStart, ja);
  return ja;
}

// Zeitpunkt, ab dem eine Nachricht `stunden` Arbeitsstunden unbeantwortet ist.
// Feiertage werden nicht berücksichtigt.
export function sichtbarAb(eingangMs, stunden = SCHWELLE_ARBEITSSTUNDEN) {
  if (!eingangMs) return 0;
  const ziel = stunden * 4;
  let slot = Math.ceil(eingangMs / SCHRITT) * SCHRITT;
  let gesammelt = 0;
  for (let i = 0; i < 5000 && gesammelt < ziel; i++) {
    if (istArbeitszeit(slot)) gesammelt++;
    slot += SCHRITT;
  }
  return slot;
}

const aktionVon = (item) => item?.suggested_action || (item?.track === 'support' ? 'supportticket' : 'anfrage');

/**
 * Arbeitsbereich eines Eintrags. Quelle ist die KI-Einordnung der letzten Kundennachricht
 * (EmailThreadIndex.anliegen, mit Textbeleg). Absender-Regeln "Verwaltung" haben Vorrang.
 *  support    — technische Unterstützung an Website, Shop, Hosting, Tracking (Fehler oder Änderung)
 *  neu        — neues Projekt, neue Leistung, Angebotsanfrage, Neukunde
 *  kunde      — alle anderen Kundenanliegen (Abstimmung, Feedback, Druck, Termine, Rechnungsfragen)
 *  verwaltung — Lieferanten, Steuerberatung, Bank, Behörden, Spam
 *  offen      — noch nicht eingeordnet (Nachbewertung läuft)
 */
export function klasseVon(e) {
  if (e.verwaltung) return 'verwaltung';
  const anliegen = e.thread?.anliegen;
  if (anliegen === 'web_support') return 'support';
  if (anliegen === 'neue_anfrage') return 'neu';
  if (anliegen === 'kundenanliegen') return 'kunde';
  if (anliegen === 'verwaltung' || anliegen === 'kein_geschaeft') return 'verwaltung';
  // Telefon-KI, manuell erfasst oder Verlauf ohne Einordnung: KI-Vorschlag des Eintrags
  if (e.item && aktionVon(e.item) === 'anfrage') return 'neu';
  return e.thread ? 'offen' : 'kunde';
}

/**
 * Baut die Einträge des Posteingangs.
 *  threads    — EmailThreadIndex mit needs_reply = true (je offener Konversation genau einer)
 *  items      — offene CrmInboxItem (status new, decision offen)
 *  itemZeilen — EmailThreadIndex-Zeilen zu den Verläufen dieser Items (für die Konversationszuordnung)
 *  regeln     — InboxBlockedSender (mode ausblenden | verwaltung)
 *  eskalationen — Set offener Eskalations-Verläufe (thread_id)
 * Ein E-Mail-Item, dessen Konversation beantwortet oder erledigt ist, verlässt den Posteingang.
 */
export function baueEintraege({ threads = [], items = [], itemZeilen = [], regeln = [], eskalationen = new Set(), jetzt = Date.now() }) {
  const aktiv = regeln.filter((r) => r.is_active !== false);
  const ausblenden = aktiv.filter((r) => (r.mode || 'ausblenden') === 'ausblenden');
  const verwaltung = aktiv.filter((r) => r.mode === 'verwaltung');

  const eintraege = [];
  const nachKonversation = new Map();
  const nachThread = new Map();

  for (const t of threads) {
    const absender = t.last_from || t.last_inbound_from || '';
    if (isBlockedSender(absender, ausblenden)) continue;
    const e = {
      key: `t-${t.thread_id}`,
      threadId: String(t.thread_id),
      thread: t,
      item: null,
      eingang: toTime(t.last_message_at),
      absender,
      absenderName: t.last_from_name || '',
      betreff: t.subject || '',
      verwaltung: isBlockedSender(absender, verwaltung),
      eskalation: eskalationen.has(String(t.thread_id)),
      sofort: false,
    };
    eintraege.push(e);
    nachThread.set(e.threadId, e);
    if (t.conversation_key) nachKonversation.set(t.conversation_key, e);
  }

  const zeileNachThread = new Map(itemZeilen.map((r) => [String(r.thread_id), r]));
  const sortiert = [...items].sort((a, b) => toTime(b.received_at || b.created_date) - toTime(a.received_at || a.created_date));
  for (const item of sortiert) {
    const tid = threadIdOf(item) ? String(threadIdOf(item)) : null;
    const absender = item.sender_email || '';
    if (isBlockedSender(absender, ausblenden)) continue;
    if (tid) {
      const zeile = zeileNachThread.get(tid);
      if (zeile) {
        const offen = (zeile.conversation_key && nachKonversation.get(zeile.conversation_key)) || nachThread.get(tid);
        if (offen) {
          if (!offen.item) offen.item = item;
          if (eskalationen.has(tid)) offen.eskalation = true;
        }
        // Konversation beantwortet oder erledigt -> nicht mehr im Posteingang
        continue;
      }
    }
    // Telefon-KI, manuell erfasst, oder Verlauf noch nicht im Verzeichnis
    eintraege.push({
      key: `i-${item.id}`,
      threadId: tid,
      thread: null,
      item,
      eingang: toTime(item.received_at || item.created_date),
      absender,
      absenderName: item.sender_name || '',
      betreff: item.subject || '',
      verwaltung: isBlockedSender(absender, verwaltung),
      eskalation: tid ? eskalationen.has(tid) : false,
      sofort: item.source !== 'email',
    });
  }

  return eintraege.map((e) => {
    const ab = e.sofort || e.eskalation ? e.eingang : sichtbarAb(e.eingang);
    const klasse = klasseVon(e);
    return {
      ...e,
      klasse,
      sichtbarAb: ab,
      sichtbar: jetzt >= ab,
      ueberfaellig: jetzt - e.eingang >= UEBERFAELLIG_STUNDEN * 3600 * 1000,
    };
  });
}

export const FILTER = [
  { key: 'alle', label: 'Alle', passt: (e) => e.klasse !== 'verwaltung' },
  { key: 'support', label: 'Support (Web)', passt: (e) => e.klasse === 'support' },
  { key: 'kunde', label: 'Kundenanfragen', passt: (e) => e.klasse === 'kunde' },
  { key: 'neu', label: 'Neue Anfragen', passt: (e) => e.klasse === 'neu' },
  { key: 'offen', label: 'Noch nicht eingeordnet', passt: (e) => e.klasse === 'offen', nurWennVorhanden: true },
  { key: 'verwaltung', label: 'Verwaltung', passt: (e) => e.klasse === 'verwaltung' },
];

export const KLASSE_LABEL = {
  support: 'Support (Web)',
  kunde: 'Kundenanfrage',
  neu: 'Neue Anfrage',
  offen: 'Wird eingeordnet',
  verwaltung: 'Verwaltung',
};

export function zaehle(eintraege) {
  const sichtbar = eintraege.filter((e) => e.sichtbar);
  const zahlen = Object.fromEntries(FILTER.map((f) => [f.key, sichtbar.filter(f.passt).length]));
  const alle = sichtbar.filter(FILTER[0].passt);
  return {
    zahlen,
    gesamt: zahlen.alle,
    ueberfaellig: alle.filter((e) => e.ueberfaellig).length,
    eskalationen: alle.filter((e) => e.eskalation).length,
  };
}
