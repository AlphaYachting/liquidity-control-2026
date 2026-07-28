// Dieselbe Konversation liegt in der E-Mail-DB teils als mehrere Thread-Datensätze
// (gleicher Betreff, gleiche Gegenstelle). Eine Antwort landet dann im Geschwister-Thread
// und wäre pro Thread betrachtet unsichtbar. Darum vor der Triage zusammenführen.

// "AW: Re: Fwd: Feedback" -> "feedback"
export const normalizeSubject = (s) => {
  let out = String(s || '').toLowerCase().trim();
  let prev;
  do {
    prev = out;
    out = out.replace(/^\s*(re|aw|fw|fwd|wg|antw|antwort)\s*(\[\d+\])?\s*:\s*/i, '');
    out = out.replace(/^\s*\[external\]\s*/i, '');
  } while (out !== prev);
  return out.trim();
};

export const senderDomain = (from) => {
  const m = String(from || '').toLowerCase().match(/@([a-z0-9.\-]+\.[a-z]{2,})/);
  return m ? m[1] : '';
};

// Gruppenschlüssel: normalisierter Betreff + Domain der Gegenstelle
export const groupKey = (t) =>
  `${normalizeSubject(t.subject)}|${senderDomain(t.last_inbound_from || t.last_from || t.from)}`;

const timeOf = (t) => new Date(String(t.last_message_at || '').slice(0, 19).replace(' ', 'T') + 'Z').getTime() || 0;

// Pro Gruppe nur den jüngsten Thread behalten — und nur, wenn in der GESAMTEN Gruppe
// keine spätere ausgehende/interne Nachricht existiert (dann wurde bereits geantwortet).
export const collapseAnsweredGroups = (threads) => {
  const groups = new Map();
  (threads || []).forEach((t) => {
    const k = groupKey(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  });

  const result = [];
  groups.forEach((list) => {
    const newest = list.reduce((a, b) => (timeOf(b) > timeOf(a) ? b : a));
    const answeredLater = list.some(
      (t) => t !== newest && timeOf(t) >= timeOf(newest) && (t.last_direction || t.direction) !== 'in'
    );
    if (!answeredLater) result.push({ ...newest, _group_size: list.length });
  });
  return result;
};