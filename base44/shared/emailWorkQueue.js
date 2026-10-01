// EINE gemeinsame Quelle für die Posteingangs-Regel "unbeantwortet".
// Backend (Verlaufs-Index) und Frontend (Kopie unter src/lib/crm) folgen derselben Logik.
import { domainOf, isInternalDomain, isSystemDomain, isFreemailDomain } from './senderLists.js';

// Abwesenheitsnotizen, Unzustellbar-Meldungen u. ä. — nie eine Kundenanfrage
const AUTO_SUBJECT = /^\s*(automatische antwort|automatic reply|autoreply|auto-reply|abwesend|abwesenheit|out of (the )?office|unzustellbar|undeliverable|nicht zugestellt|delivery status notification|mail delivery (failed|system)|returned mail)\b/i;
// Kalender-Rückmeldungen — von uns gesendet zählen sie als Reaktion, vom Kunden sind sie keine Anfrage
const CALENDAR_RESPONSE = /^\s*(angenommen|abgelehnt|zugesagt|abgesagt|mit vorbehalt angenommen|vorläufig angenommen|accepted|declined|tentative|tentatively accepted)\s*:/i;
const NOREPLY = /(^|[^a-z0-9])(no-?reply|do-?not-?reply|mailer-daemon|postmaster|mailrobot)@/i;

// Präfixe, die eine Konversation nicht verändern (Antwort, Weiterleitung, Kalender, Autoreply)
const PREFIX = /^\s*(re|aw|fw|fwd|wg|antw|antwort|angenommen|abgelehnt|zugesagt|abgesagt|mit vorbehalt angenommen|vorläufig angenommen|accepted|declined|tentative|tentatively accepted|einladung|aktualisierte einladung|invitation|updated invitation|automatische antwort|unzustellbar)\s*(\[\d+\])?\s*:\s*/i;

// "2026-10-01 08:23:22" (UTC aus der E-Mail-DB) oder ISO -> Millisekunden
export function toTime(s) {
  if (!s) return 0;
  const str = String(s);
  const iso = str.includes('T') ? str : str.slice(0, 19).replace(' ', 'T') + 'Z';
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// "AW: Angenommen: Feedback  (a@b.at)" -> "feedback"
export function normalizeSubject(s) {
  let out = String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  let prev;
  do {
    prev = out;
    out = out.replace(PREFIX, '');
    out = out.replace(/^\s*\[(external|extern)\]\s*/i, '');
  } while (out !== prev);
  // Kalender-Betreffe enden auf "(adresse@firma.at)" — für die Zuordnung unerheblich
  out = out.replace(/\s*\([^)]*@[^)]*\)\s*$/, '');
  return out.trim();
}

const emailOf = (s) => (String(s || '').toLowerCase().match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/) || [])[0] || '';

// Gegenstelle der Konversation: Firmen-Domain, bei Freemail die ganze Adresse
export function counterpartOf(t) {
  const kandidaten = [t.last_inbound_from, t.last_from, ...String(t.last_to || '').split(',')];
  for (const k of kandidaten) {
    const d = domainOf(k);
    if (!d || isInternalDomain(d)) continue;
    return isFreemailDomain(d) ? emailOf(k) : d;
  }
  return '';
}

export function conversationKeyOf(t) {
  const subj = normalizeSubject(t.subject);
  if (!subj) return `#${t.thread_id}`;
  return `${subj}|${counterpartOf(t)}`;
}

// Verläufe, die für "wer hat zuletzt geschrieben" nicht zählen
export function isNoiseThread(t) {
  const subj = String(t.subject || '');
  const dir = t.last_direction || t.direction;
  const sender = t.last_from || t.last_inbound_from || t.from || '';
  if (AUTO_SUBJECT.test(subj)) return true;
  if (dir === 'in' && CALENDAR_RESPONSE.test(subj)) return true;
  if (dir === 'in' && NOREPLY.test(sender)) return true;
  if (dir === 'in' && isSystemDomain(domainOf(sender))) return true;
  return false;
}

/**
 * Ein einzelner Verlauf ist ein Kandidat für den Posteingang, wenn:
 *  1. die letzte Nachricht eingehend und extern ist (keine System-, Autoreply- oder Kalendermail)
 *  2. sie NACH einem manuellen "Erledigt" aus der App kam (done_at gilt nur bis zur nächsten Kundennachricht)
 *  3. der Verlauf als Geschäftskonversation belegt ist: wir haben schon geschrieben, es gibt mehrere
 *     Nachrichten, oder ein Kunde bzw. eine inhaltliche Kategorie ist zugeordnet.
 * Der KI-Status (offen/beantwortet/erledigt) entscheidet NICHT mehr — einzige Ausnahme: eine einzelne,
 * unbeantwortete Nachricht, die die KI als Spam/System erledigt hat.
 */
export function computeNeedsReply(t) {
  const direction = t.last_direction || t.direction;
  if (direction !== 'in') return false;
  const sender = t.last_from || t.last_inbound_from || t.from;
  const domain = domainOf(sender);
  if (!domain || isInternalDomain(domain)) return false;
  if (isNoiseThread(t)) return false;
  const eingang = toTime(t.last_message_at);
  if (t.done_at && toTime(t.done_at) >= eingang) return false;
  const einzeln = (t.message_count || 0) <= 1 && !t.has_outbound;
  if (einzeln && t.crm_status === 'lead_angelegt') return false;
  if (einzeln && !t.done_at && t.status === 'erledigt' && (!t.category || t.category === 'sonstiges')) return false;
  const meaningfulCategory = !!t.category && t.category !== 'sonstiges';
  return t.has_outbound === true || (t.message_count || 0) > 1 || !!t.customer || meaningfulCategory;
}

/**
 * Konversationsebene: dieselbe Konversation liegt in der E-Mail-DB oft in mehreren Verläufen
 * (Antwort im Parallel-Verlauf, Kalenderzusage, Doppelversand). Pro Konversation zählt nur die
 * jüngste Nachricht von Kunde oder uns; interne Weiterleitungen zählen nicht als Antwort.
 * Rückgabe: Map thread_id -> { needs_reply, conversation_key, conversation_size }
 * Genau ein Verlauf je offener Konversation bekommt needs_reply = true (der jüngste).
 */
export function resolveConversations(rows) {
  const groups = new Map();
  for (const r of rows || []) {
    const key = conversationKeyOf(r);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const result = new Map();
  groups.forEach((list, key) => {
    const relevant = list.filter((r) => {
      const dir = r.last_direction || r.direction;
      return (dir === 'in' || dir === 'out') && !isNoiseThread(r) && toTime(r.last_message_at) > 0;
    });
    const doneAt = Math.max(0, ...list.map((r) => toTime(r.done_at)));
    let openId = null;
    if (relevant.length) {
      const newest = relevant.reduce((a, b) => (toTime(b.last_message_at) > toTime(a.last_message_at) ? b : a));
      if (computeNeedsReply(newest) && toTime(newest.last_message_at) > doneAt) openId = String(newest.thread_id);
    }
    list.forEach((r) => result.set(String(r.thread_id), {
      needs_reply: String(r.thread_id) === openId,
      conversation_key: key,
      conversation_size: list.length,
    }));
  });
  return result;
}
