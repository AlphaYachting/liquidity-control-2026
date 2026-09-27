import { isInternalDomain, domainOf } from './senderLists.js';

// Die E-Mail-Datenbank führt kein Empfängerfeld je Nachricht. Belegt wird der
// Empfänger daher zweifach: aus den "An:"/"To:"-Kopfzeilen im Nachrichtentext,
// ergänzt um die beteiligten eigenen Postfächer der Konversation.
const headerTo = (text) => {
  const lines = String(text || '').split('\n').slice(0, 25);
  for (const line of lines) {
    const m = line.match(/^\s*(?:an|to)\s*:\s*(.+)$/i);
    if (m && m[1].includes('@')) return m[1].trim();
  }
  return '';
};

const liste = (v) => (Array.isArray(v) ? v : String(v || '').split(/[;,]/)).map((a) => String(a).trim()).filter(Boolean);

export function resolveRecipient(firstIn, messages) {
  // Die E-Mail-DB liefert inzwischen to/cc je Nachricht — das ist der sichere Beleg.
  const to = liste(firstIn?.to);
  const cc = liste(firstIn?.cc);
  if (to.length) return (to.join(', ') + (cc.length ? ` · Cc: ${cc.join(', ')}` : '')).slice(0, 300);
  const fromHeader = headerTo(firstIn?.text);
  if (fromHeader) return fromHeader.slice(0, 300);
  const own = [...new Set(
    (messages || [])
      .map((m) => String(m.from || '').trim())
      .filter((a) => a && isInternalDomain(domainOf(a))),
  )];
  return own.join(', ').slice(0, 300);
}