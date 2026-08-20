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

export function resolveRecipient(firstIn, messages) {
  const fromHeader = headerTo(firstIn?.text);
  if (fromHeader) return fromHeader.slice(0, 300);
  const own = [...new Set(
    (messages || [])
      .map((m) => String(m.from || '').trim())
      .filter((a) => a && isInternalDomain(domainOf(a))),
  )];
  return own.join(', ').slice(0, 300);
}