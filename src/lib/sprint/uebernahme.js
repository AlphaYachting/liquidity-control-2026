import { base44 } from '@/api/base44Client';
import { ohneArchiv, PROJEKT_LAUFEND } from '@/lib/sprint/aktivFilter';
import { ticketBereinigen } from '@/lib/sprint/ticketBereinigen';

// Einmalige Übernahme der Alttickets: jede Person bestätigt, was wirklich bei ihr liegt.
// Zur Übernahme gehört alles, was vor dem Live-Gang angelegt wurde (Montag 05.10.2026, 00:00 Wien).
export const UEBERNAHME_BIS = '2026-10-04T22:00:00';

export const ANTWORTEN = [
  { wert: 'offen', label: 'Meins · nicht begonnen' },
  { wert: 'in_arbeit', label: 'Meins · in Arbeit' },
  { wert: 'wartet', label: 'Wartet auf Feedback' },
  { wert: 'erledigt', label: 'Schon erledigt' },
  { wert: 'zurueck', label: 'Gehört nicht zu mir' },
  { wert: 'entfaellt', label: 'Gibt es nicht mehr' },
];
export const ANTWORT_LABEL = Object.fromEntries(ANTWORTEN.map((a) => [a.wert, a.label]));
export const WARTET_AUF = [
  { wert: 'kunde', label: 'Kunde' },
  { wert: 'intern', label: 'Kollege intern' },
  { wert: 'lieferant', label: 'Lieferant' },
];

export const UEBERNAHME_KEY = (email) => ['uebernahme', email];
export const UEBERNAHME_TEAM_KEY = ['uebernahmeTeam'];

const gleich = (a, b) => (a || '').toLowerCase() === (b || '').toLowerCase();

// Routinen und alles nach dem Live-Gang Angelegte gehören nicht zur Übernahme.
export const imUmfang = (t) => !t.archiviert && !t.rhythmus && String(t.created_date || '') < UEBERNAHME_BIS;
export const istBestaetigt = (t) => !!t.uebernahme_am;
export const brauchtAntwort = (t) => imUmfang(t) && t.status !== 'erledigt' && !istBestaetigt(t);

// Meine Übernahme: was mir zugeteilt ist, plus was ich schon beantwortet habe (auch Zurückgegebenes).
export async function ladeMeineUebernahme(email) {
  const [zugeteilt, beantwortet, projekte] = await Promise.all([
    base44.entities.Ticket.filter(ohneArchiv({ assignee_email: email, status: { $ne: 'erledigt' } }), 'order', 2000),
    base44.entities.Ticket.filter(ohneArchiv({ uebernahme_von: email }), 'order', 2000),
    base44.entities.Project.filter(PROJEKT_LAUFEND, 'title', 500),
  ]);
  const projektById = Object.fromEntries(projekte.map((p) => [p.id, p]));
  const nachId = new Map();
  [...zugeteilt, ...beantwortet.filter(istBestaetigt)].forEach((t) => {
    if (imUmfang(t) && projektById[t.project_id]) nachId.set(t.id, t);
  });
  const tickets = [...nachId.values()];
  const clientIds = [...new Set(tickets.map((t) => projektById[t.project_id]?.client_id).filter(Boolean))];
  const clients = clientIds.length
    ? await base44.entities.Client.filter({ id: { $in: clientIds.slice(0, 200) } }, 'name', 500)
    : [];
  return { tickets, projekte, clients };
}

// Eine Antwort speichern. Gibt das geänderte Ticket zurück.
// darfArchivieren: Projektverantwortliche und Führung archivieren „Gibt es nicht mehr" sofort,
// bei allen anderen bleibt es ein Vorschlag an den Projektverantwortlichen.
export async function antworte(ticket, wert, { email, darfArchivieren = false } = {}) {
  const jetzt = new Date().toISOString();
  const patch = { uebernahme_antwort: wert, uebernahme_am: jetzt, uebernahme_von: email };

  if (['offen', 'in_arbeit', 'wartet', 'erledigt'].includes(wert)) {
    if (ticket.status !== wert) { patch.status = wert; patch.last_status_change = jetzt; }
    if (!gleich(ticket.assignee_email, email)) patch.assignee_email = email;
    if (wert === 'wartet' && !ticket.wartet_auf) patch.wartet_auf = 'kunde';
    await base44.entities.Ticket.update(ticket.id, patch);
    return { ...ticket, ...patch };
  }

  if (wert === 'zurueck') {
    // Zurück in den Topf: niemandem zugeteilt, der Projektverantwortliche verteilt neu.
    try {
      await base44.entities.Ticket.update(ticket.id, { ...patch, assignee_email: null });
      return { ...ticket, ...patch, assignee_email: null };
    } catch (_) {
      await base44.entities.Ticket.update(ticket.id, patch);
      return { ...ticket, ...patch };
    }
  }

  if (wert === 'entfaellt') {
    if (!gleich(ticket.assignee_email, email)) patch.assignee_email = email;
    await base44.entities.Ticket.update(ticket.id, patch);
    if (darfArchivieren) {
      const res = await ticketBereinigen('archivieren', [ticket.id], 'nicht_mehr_relevant');
      if (res.abgelehnt.length) throw new Error(res.abgelehnt[0].grund || 'Archivieren abgelehnt');
      return { ...ticket, ...patch, archiviert: true };
    }
    return { ...ticket, ...patch };
  }
  throw new Error('Unbekannte Antwort');
}

// Zusatzangaben zu einer Antwort (Reststunden, Fälligkeit, worauf gewartet wird …)
export async function speichereDetail(ticket, patch) {
  await base44.entities.Ticket.update(ticket.id, patch);
  return { ...ticket, ...patch };
}

// Mehrere Tickets nacheinander beantworten — wenige gleichzeitig, damit nichts gedrosselt wird.
export async function antworteAlle(tickets, wert, kontext, onFortschritt) {
  const ergebnis = [];
  const fehler = [];
  let i = 0;
  const arbeiter = async () => {
    while (i < tickets.length) {
      const t = tickets[i++];
      try { ergebnis.push(await antworte(t, wert, kontext)); } catch (e) { fehler.push({ ticket: t, text: e?.message || 'Fehler' }); }
      onFortschritt?.(ergebnis.length + fehler.length, tickets.length);
    }
  };
  await Promise.all([arbeiter(), arbeiter(), arbeiter()]);
  return { ergebnis, fehler };
}

export const meldeHinweis = (email, art, text, projectId) =>
  base44.entities.UebernahmeHinweis.create({
    person_email: email, art, text: text.trim(), ...(projectId ? { project_id: projectId } : {}),
  });

// Gesamtbild für Projektverantwortliche und Führung.
export async function ladeUebernahmeTeam() {
  const [tickets, projekte, clients, members, hinweise] = await Promise.all([
    base44.entities.Ticket.filter(ohneArchiv({}), 'order', 5000),
    base44.entities.Project.filter(PROJEKT_LAUFEND, 'title', 500),
    base44.entities.Client.list('name', 1000),
    base44.entities.TeamMember.filter({ active: { $ne: false } }, 'name', 200),
    base44.entities.UebernahmeHinweis.filter({ erledigt: { $ne: true } }, '-created_date', 500).catch(() => []),
  ]);
  const projektById = Object.fromEntries(projekte.map((p) => [p.id, p]));
  const imBild = tickets.filter((t) => imUmfang(t) && projektById[t.project_id]);
  return { tickets: imBild, projekte, projektById, clients, members, hinweise };
}

// Fortschritt je Person: was noch ohne Antwort bei ihr liegt und was sie schon beantwortet hat.
export function fortschrittJePerson(tickets, members) {
  const zeilen = {};
  const zeile = (email) => {
    const k = (email || '').toLowerCase();
    if (!zeilen[k]) zeilen[k] = { email: k, offen: 0, bestaetigt: 0, zurueck: 0 };
    return zeilen[k];
  };
  members.forEach((m) => zeile(m.email));
  tickets.forEach((t) => {
    if (brauchtAntwort(t) && t.assignee_email) zeile(t.assignee_email).offen += 1;
    if (istBestaetigt(t) && t.uebernahme_von) {
      const z = zeile(t.uebernahme_von);
      z.bestaetigt += 1;
      if (t.uebernahme_antwort === 'zurueck') z.zurueck += 1;
    }
  });
  const name = Object.fromEntries(members.map((m) => [(m.email || '').toLowerCase(), m.name]));
  return Object.values(zeilen)
    .map((z) => ({ ...z, name: name[z.email] || z.email, gesamt: z.offen + z.bestaetigt }))
    .filter((z) => z.gesamt > 0)
    .sort((a, b) => b.offen - a.offen);
}

// Topf: zurückgegebene Tickets, die noch niemand neu übernommen hat.
export const imTopf = (t) => t.uebernahme_antwort === 'zurueck';
export const istArchivVorschlag = (t) => t.uebernahme_antwort === 'entfaellt' && !t.archiviert;

// Neu verteilen: die neue Person bestätigt das Ticket selbst in ihrer Übernahme.
export async function verteileNeu(ticket, email) {
  const patch = { assignee_email: email, uebernahme_antwort: null, uebernahme_am: null, uebernahme_von: null };
  await base44.entities.Ticket.update(ticket.id, patch);
  return { ...ticket, ...patch };
}

// Archiv-Vorschlag ablehnen: das Ticket bleibt und geht zurück an die zuständige Person.
export async function vorschlagAblehnen(ticket) {
  const patch = { uebernahme_antwort: null, uebernahme_am: null, uebernahme_von: null };
  await base44.entities.Ticket.update(ticket.id, patch);
  return { ...ticket, ...patch };
}
