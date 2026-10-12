// Automatische Zuweisung von Post (Entscheidung Alfons 12.10.2026):
// Ist eine Kundenkonversation einen Arbeitstag (9 Arbeitsstunden, Mo–Fr 8–17 Uhr Wien) unbeantwortet
// und hat sie niemand zugewiesen, geht sie an die Projektverantwortliche des Kunden — gibt es keine,
// an den Geschäftsführer. Sie erscheint dann in „Mein Tag“ dieser Person.
//  - Masseverwalter-Post: nie
//  - vertrauliche Post (Verwaltung, nur an den GF): nur an den Geschäftsführer
//  - Spam laut KI (anliegen kein_geschaeft): nie
//  - nur Konversationen ab STICHTAG — der Altbestand wird im Posteingang von Hand verteilt
import { vertraulichGrund, INHABER_EMAIL } from './vertraulich.js';
import { domainOf, isFreemailDomain, isInternalDomain } from './senderLists.js';

export const ARBEITSTAG_STUNDEN = 9;
export const STICHTAG = '2026-10-12 00:00:00';
const MAX_JE_LAUF = 25;
const SCHRITT = 15 * 60 * 1000;

const toTime = (s) => {
  if (!s) return 0;
  const str = String(s);
  const t = new Date(str.includes('T') ? str : str.slice(0, 19).replace(' ', 'T') + 'Z').getTime();
  return Number.isNaN(t) ? 0 : t;
};

const wien = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vienna', weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
function istArbeitszeit(ms) {
  const teile = wien.formatToParts(new Date(ms));
  const tag = teile.find((p) => p.type === 'weekday')?.value;
  const stunde = Number(teile.find((p) => p.type === 'hour')?.value);
  return tag !== 'Sat' && tag !== 'Sun' && stunde >= 8 && stunde < 17;
}

// Zeitpunkt, ab dem eine Nachricht `stunden` Arbeitsstunden unbeantwortet ist (gleiche Rechnung wie im Posteingang)
export function faelligAb(eingangMs, stunden = ARBEITSTAG_STUNDEN) {
  if (!eingangMs) return Infinity;
  let slot = Math.ceil(eingangMs / SCHRITT) * SCHRITT;
  let gesammelt = 0;
  for (let i = 0; i < 6000 && gesammelt < stunden * 4; i++) {
    if (istArbeitszeit(slot)) gesammelt++;
    slot += SCHRITT;
  }
  return slot;
}

const RECHTSFORM = /\b(gmbh|ges\.?m\.?b\.?h\.?|co\.?\s*kg|kg|og|e\.?\s*u\.?|ag|holding|und|&|co)\b/g;
const normName = (s) => String(s || '').toLowerCase().replace(RECHTSFORM, ' ').replace(/[^a-z0-9äöüß]+/g, ' ').trim();

// Kunde einer Konversation finden: Absender-Domain (bei Freemail die ganze Adresse) gegen
// Kunden-Kontaktadressen, sonst der von der KI erkannte Kundenname gegen den Kundennamen.
function kundeFinden(t, clients) {
  const adresse = String(t.last_inbound_from || t.last_from || '').toLowerCase();
  const dom = domainOf(adresse);
  if (dom && !isInternalDomain(dom)) {
    const treffer = clients.find((c) => [c.contact_email, c.billing_email].some((m) => {
      const mm = String(m || '').toLowerCase();
      if (!mm) return false;
      return isFreemailDomain(dom) ? adresse.includes(mm) : domainOf(mm) === dom;
    }));
    if (treffer) return treffer;
  }
  const name = normName(t.customer);
  if (name.length >= 4) {
    return clients.find((c) => {
      const cn = normName(c.name);
      return cn.length >= 4 && (cn === name || cn.includes(name) || name.includes(cn));
    }) || null;
  }
  return null;
}

export async function autoZuweisen(svc, { jetzt = Date.now() } = {}) {
  const stats = { geprueft: 0, zugewiesen: 0, an_pl: 0, an_gf: 0 };
  const [offen, zuweisungen, regeln, clients, projekte, team] = await Promise.all([
    svc.entities.EmailThreadIndex.filter({ needs_reply: true, last_message_at: { $gte: STICHTAG } }, 'last_message_at', 500),
    svc.entities.PostZuweisung.list('-zugewiesen_am', 3000),
    svc.entities.InboxBlockedSender.list('-created_date', 200),
    svc.entities.Client.list('-updated_date', 1000),
    svc.entities.Project.filter({ status: 'aktiv' }, '-updated_date', 1000),
    svc.entities.TeamMember.filter({ active: true }, 'name', 100),
  ]);
  const vergeben = new Set();
  for (const z of zuweisungen) {
    if (z.schluessel) vergeben.add(`k:${z.schluessel}`);
    if (z.thread_id) vergeben.add(`t:${z.thread_id}`);
  }
  const aktiveMails = new Set(team.map((m) => String(m.email || '').toLowerCase()));

  for (const t of offen) {
    if (stats.zugewiesen >= MAX_JE_LAUF) break;
    const schluessel = t.conversation_key || `#${t.thread_id}`;
    if (vergeben.has(`k:${schluessel}`) || vergeben.has(`t:${t.thread_id}`)) continue;
    if (t.anliegen === 'kein_geschaeft') continue;
    if (faelligAb(toTime(t.last_message_at)) > jetzt) continue;
    stats.geprueft++;

    const grund = vertraulichGrund({
      absender: [t.last_from, t.last_inbound_from], empfaenger: t.last_to, regeln, istAdmin: false,
    });
    if (grund === 'masseverwalter') continue;

    let an = INHABER_EMAIL;
    if (!grund) {
      const kunde = kundeFinden(t, clients);
      const projekt = kunde
        ? projekte.filter((p) => p.client_id === kunde.id && !p.is_legacy)[0]
          || projekte.find((p) => p.client_id === kunde.id)
        : null;
      const pl = String(projekt?.pm_email || '').toLowerCase();
      if (pl && aktiveMails.has(pl)) an = pl;
    }

    await svc.entities.PostZuweisung.create({
      schluessel,
      thread_id: String(t.thread_id),
      betreff: t.subject || '',
      zugewiesen_an: an,
      zugewiesen_von: 'automatisch',
      zugewiesen_am: new Date().toISOString(),
      quelle: 'automatisch',
    });
    vergeben.add(`k:${schluessel}`);
    // Offene Eskalation zur selben Mail ohne Zuständigen mitführen
    const faelle = await svc.entities.CrmEscalation.filter({ thread_id: String(t.thread_id) }, '-created_at', 5).catch(() => []);
    for (const f of faelle) if (!f.assigned_to) await svc.entities.CrmEscalation.update(f.id, { assigned_to: an });

    stats.zugewiesen++;
    if (an === INHABER_EMAIL) stats.an_gf++; else stats.an_pl++;
  }
  return stats;
}
