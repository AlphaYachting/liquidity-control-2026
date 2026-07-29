// Die E-Mail-DB liefert kein Empfänger-Feld pro Nachricht.
// Best-Effort: Empfänger aus Outlook-/Weiterleitungs-Headern im Nachrichtentext lesen
// ("An: x@y.at; z@y.at", "To: ...", "Cc: ..."), sonst aus den Gesprächsteilnehmern ableiten.

export const extractRecipients = (m) => {
  if (m?.to || m?.cc) return { to: m.to || '', cc: m.cc || '' };
  const head = String(m?.text || '').split('\n').slice(0, 25);
  const find = (labels) => {
    for (const line of head) {
      const match = line.match(new RegExp(`^\\s*(?:${labels})\\s*:\\s*(.+)$`, 'i'));
      if (match && match[1].includes('@')) return match[1].trim();
    }
    return '';
  };
  return { to: find('an|to'), cc: find('cc|kopie') };
};

// Alle Beteiligten der (ggf. zusammengeführten) Konversation — eindeutige Absender
export const collectParticipants = (messages) => {
  const map = new Map();
  (messages || []).forEach((m) => {
    const key = String(m.from || '').toLowerCase();
    if (key && !map.has(key)) {
      map.set(key, { email: m.from, name: m.from_name || '', direction: m.direction });
    }
  });
  return [...map.values()];
};