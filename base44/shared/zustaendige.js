// ZUSTÄNDIGE EINES TICKETS — Backend-Gegenstück zu src/lib/sprint/zustaendige.js (gleiche Logik).
// Führend ist die Liste assignee_emails (gleichwertig, höchstens vier); assignee_email ist der
// Spiegel der ersten Person. Ist die Liste leer, gilt das Einzelfeld.

export const MAX_ZUSTAENDIGE = 4;

export const normMail = (s) => String(s || '').trim().toLowerCase();

const eindeutig = (liste) => {
  const out = [];
  (liste || []).forEach((e) => {
    const m = normMail(e);
    if (m && !out.includes(m)) out.push(m);
  });
  return out;
};

export function zustaendigeVon(ticket) {
  if (!ticket) return [];
  if (Array.isArray(ticket.assignee_emails) && ticket.assignee_emails.length) {
    const liste = eindeutig(ticket.assignee_emails);
    if (liste.length) return liste;
  }
  const einzel = normMail(ticket.assignee_email);
  return einzel ? [einzel] : [];
}

export const istZustaendig = (ticket, email) => {
  const m = normMail(email);
  return !!m && zustaendigeVon(ticket).includes(m);
};

export function zustaendigFelder(liste) {
  const sauber = eindeutig(liste);
  if (sauber.length > MAX_ZUSTAENDIGE) throw new Error('Höchstens vier zuständige Personen');
  return { assignee_emails: sauber, assignee_email: sauber[0] || '' };
}
