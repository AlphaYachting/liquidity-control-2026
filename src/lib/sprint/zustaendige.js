import { base44 } from '@/api/base44Client';

// ZUSTÄNDIGE EINES TICKETS — die einzige Stelle, die Ticket-Zuständigkeiten liest und schreibt.
// Führend ist die Liste assignee_emails (gleichwertige Personen, höchstens vier).
// assignee_email bleibt als Spiegel der ersten Person bestehen, damit ältere Abfragen weiter
// stimmen. Kein anderer Code schreibt assignee_email oder assignee_emails direkt.
// Gleiche Logik für Backend-Funktionen: base44/shared/zustaendige.js

export const MAX_ZUSTAENDIGE = 4;
export const FEHLER_ZU_VIELE = 'Höchstens vier zuständige Personen';

export const normMail = (s) => String(s || '').trim().toLowerCase();

const eindeutig = (liste) => {
  const out = [];
  (liste || []).forEach((e) => {
    const m = normMail(e);
    if (m && !out.includes(m)) out.push(m);
  });
  return out;
};

// Liste der Zuständigen — fällt auf das Einzelfeld zurück, solange die Liste leer ist.
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

export const hatZustaendige = (ticket) => zustaendigeVon(ticket).length > 0;

// Felder zum Speichern — beim Anlegen ins Create-Objekt spreizen.
export function zustaendigFelder(liste) {
  const sauber = eindeutig(liste);
  if (sauber.length > MAX_ZUSTAENDIGE) throw new Error(FEHLER_ZU_VIELE);
  return { assignee_emails: sauber, assignee_email: sauber[0] || '' };
}

// Neue Liste aus der alten und genau einer Änderung.
export function wendeAn(alt, aenderung = {}) {
  let liste = eindeutig(alt);
  if (Array.isArray(aenderung.setzen)) liste = eindeutig(aenderung.setzen);
  else if (aenderung.dazu) {
    const m = normMail(aenderung.dazu);
    if (m && !liste.includes(m)) liste = [...liste, m];
  } else if (aenderung.weg) {
    const m = normMail(aenderung.weg);
    liste = liste.filter((e) => e !== m);
  } else if (aenderung.ersetzen) {
    const a = normMail(aenderung.ersetzen.alt);
    const n = normMail(aenderung.ersetzen.neu);
    if (!n) liste = liste.filter((e) => e !== a);
    else if (liste.includes(n)) liste = liste.filter((e) => e !== a);
    else if (a && liste.includes(a)) liste = liste.map((e) => (e === a ? n : e));
    else liste = [...liste, n];
  }
  return liste;
}

// Ändert die Zuständigen eines Tickets. Lädt das Ticket frisch, damit gleichzeitige Änderungen
// anderer nicht überschrieben werden, und schreibt nur die zwei Zuständigkeitsfelder.
// aenderung: { setzen: [..] } | { dazu: email } | { weg: email } | { ersetzen: { alt, neu } }
export async function zustaendigeAendern(ticketId, aenderung) {
  const frisch = (await base44.entities.Ticket.filter({ id: ticketId }, null, 1))[0];
  if (!frisch) throw new Error('Aufgabe nicht gefunden');
  const vorher = zustaendigeVon(frisch);
  const nachher = wendeAn(vorher, aenderung);
  const felder = zustaendigFelder(nachher);
  const gleich = vorher.length === nachher.length && vorher.every((e, i) => e === nachher[i])
    && Array.isArray(frisch.assignee_emails) && frisch.assignee_emails.length === nachher.length
    && normMail(frisch.assignee_email) === (nachher[0] || '');
  if (gleich) return frisch;
  await base44.entities.Ticket.update(ticketId, felder);
  return { ...frisch, ...felder };
}

// Person zur Anzeige — unbekannte oder ausgeschiedene Personen erscheinen mit ihrer Adresse.
export function personVon(email, members = []) {
  const m = normMail(email);
  return members.find((p) => normMail(p.email) === m) || { email: m, name: m };
}

export const personenVon = (ticket, members = []) => zustaendigeVon(ticket).map((e) => personVon(e, members));

export const namenVon = (ticket, members = [], leer = 'nicht zugewiesen') => {
  const namen = personenVon(ticket, members).map((p) => p.name || p.email);
  return namen.length ? namen.join(', ') : leer;
};

// Abfragebedingung „mir zugewiesen“ — deckt Liste und Einzelfeld ab.
export const zugewiesenAnFilter = (email) => ({
  $or: [{ assignee_email: email }, { assignee_emails: normMail(email) }],
});
