// Regel (Entscheidung Alfons 22.10.2026): Jede Konversation, in der eine Kundennachricht an
// support@rittler.co ging — im An ODER in Kopie —, ist Support, unabhängig von der KI-Einordnung.
// Einzige Ausnahme: von der KI erkannter Spam (anliegen kein_geschaeft).
export const SUPPORT_ADRESSE = 'support@rittler.co';

const alsText = (v) => {
  if (!v) return '';
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : (x?.email || x?.address || ''))).join(',');
  if (typeof v === 'object') return String(v.email || v.address || '');
  return String(v);
};

// Ging eine eingehende Nachricht dieses Verlaufs an support@ (An oder Kopie)?
export function anSupport(messages) {
  return (messages || []).some((m) => m.direction === 'in'
    && `${alsText(m.to)},${alsText(m.cc)}`.toLowerCase().includes(SUPPORT_ADRESSE));
}

// Text eines Empfängerfelds (Index last_to, CrmInboxItem.recipient)
export const nenntSupport = (text) => String(text || '').toLowerCase().includes(SUPPORT_ADRESSE);
