// Personen einer Projektzeile: zuerst die Projektleitung, danach alle mit einer Aufgabe.
// So zeigt auch ein Projekt ohne Tickets, wer verantwortlich ist (statt „niemand zugewiesen“).
export function personenMitLeitung(pmEmail, ticketEmails = [], members = []) {
  const gesehen = new Set();
  const liste = [];
  for (const roh of [pmEmail, ...ticketEmails]) {
    const email = String(roh || '').trim();
    const key = email.toLowerCase();
    if (!email || gesehen.has(key)) continue;
    gesehen.add(key);
    const m = members.find((x) => String(x.email || '').toLowerCase() === key);
    liste.push(m || { email, name: email });
  }
  return liste;
}
