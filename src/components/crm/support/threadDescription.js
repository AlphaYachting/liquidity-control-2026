import { emailApi } from '@/components/crm/emails/emailApi';
import { formatMailDate } from '@/components/crm/emails/emailConfig';

const clip = (s, max = 1200) => {
  const t = String(s || '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

// Zitierten Altverlauf am Ende einer Mail abschneiden („Von: …“, „Am … schrieb“, „-----Original…“, „> …“).
// Er steht als eigene Nachricht ohnehin im Verlauf und bläht ihn nur auf.
const ZITAT_BEGINN = /^[ \t]*(?:>|Von:\s|From:\s|-{2,}\s*(?:Original|Ursprüngliche)|Am\s.{4,120}\sschrieb|On\s.{4,120}\swrote)/im;
export function ohneZitat(text) {
  const t = String(text || '').trim();
  const treffer = ZITAT_BEGINN.exec(t);
  if (!treffer || treffer.index < 40) return t;
  return `${t.slice(0, treffer.index).trim()}\n[zitierter Verlauf ausgeblendet]`;
}

// Unzustellbarkeits-Berichte und andere System-Mails (gleiche Regel wie in der Verlaufsvorschau)
export function istSystemMail(m) {
  const from = String(m?.from || '').toLowerCase();
  if (from.includes('microsoftexchange') || from.startsWith('postmaster@') || from.startsWith('mailer-daemon@')) return true;
  return /couldn'?t be delivered|undeliverable|unzustellbar|zustellung .*fehlgeschlagen/i.test(String(m?.text || '').slice(0, 300));
}

// Vollständiger Verlauf als Text — Quelldokument für das Angebots-Studio und das Support-Ticket.
// Optionen: ohneZitate — zitierten Altverlauf je Nachricht abschneiden;
// maxZeichen — Obergrenze; dann fallen die ältesten Nachrichten weg (die jüngsten bleiben vollständig).
export async function threadTranscript(threadId, { ohneZitate = false, maxZeichen = 0 } = {}) {
  if (!threadId) return '';
  // Gleicher Aufruf wie in der E-Mail-Zentrale: Parameter liegen unter params, full=1 liefert den ganzen Text
  const data = await emailApi('thread', { params: { id: threadId, msgs: 50, full: 1 } }).catch(() => null);
  const messages = data?.messages || [];
  if (messages.length === 0) return '';
  const subject = data?.thread?.subject ? `Betreff: ${data.thread.subject}\n\n` : '';
  // chronologisch (älteste zuerst) — die Datenbank liefert neueste zuerst.
  // Im Ticket haben System-Mails (Unzustellbarkeits-Berichte, Exchange/Postmaster) nichts verloren.
  const bloecke = [...messages]
    .filter((m) => !(ohneZitate && istSystemMail(m)))
    .sort((a, b) => String(a.received_at || '').localeCompare(String(b.received_at || '')))
    .map((m) => {
      const head = `${m.from_name || m.from || 'Unbekannt'} <${m.from || ''}> · ${formatMailDate(m.received_at)} · ${m.direction === 'in' ? 'eingehend' : 'ausgehend'}`;
      const text = String(m.text || m.preview || '').trim();
      return `${head}\n${ohneZitate ? ohneZitat(text) : text}`;
    });
  const TRENNER = '\n\n---\n\n';
  if (!maxZeichen) return subject + bloecke.join(TRENNER);
  // Von hinten (jüngste) auffüllen, bis die Grenze erreicht ist
  const behalten = [];
  let laenge = subject.length;
  for (let i = bloecke.length - 1; i >= 0; i--) {
    let b = bloecke[i];
    // eine einzelne riesige Nachricht wird selbst gekürzt, damit wenigstens die jüngste drin ist
    if (!behalten.length && b.length > maxZeichen - laenge - 200) b = `${b.slice(0, Math.max(0, maxZeichen - laenge - 200))}… [gekürzt]`;
    if (laenge + b.length + TRENNER.length > maxZeichen) break;
    behalten.unshift(b);
    laenge += b.length + TRENNER.length;
  }
  const weg = bloecke.length - behalten.length;
  const hinweis = weg > 0
    ? `[${weg} ältere ${weg === 1 ? 'Nachricht' : 'Nachrichten'} gekürzt — vollständig in der E-Mail-Zentrale]${TRENNER}`
    : '';
  return subject + hinweis + behalten.join(TRENNER);
}

// Baut die Ticket-Beschreibung aus dem echten E-Mail-Verlauf (jüngste Kundennachricht zuerst).
export async function descriptionFromThread(threadId) {
  if (!threadId) return '';
  const data = await emailApi('thread', { params: { id: threadId, msgs: 15, full: 1 } }).catch(() => null);
  const messages = data?.messages || [];
  if (messages.length === 0) return '';

  const inbound = messages.filter((m) => m.direction === 'in');
  const relevant = (inbound.length > 0 ? inbound : messages).slice(0, 3);

  return relevant
    .map((m) => {
      const head = `${m.from_name || m.from || 'Unbekannt'} · ${formatMailDate(m.received_at)}`;
      return `${head}\n${clip(m.text || m.preview || '')}`;
    })
    .join('\n\n---\n\n');
}