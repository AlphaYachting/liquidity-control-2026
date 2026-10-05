import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Ein Ticket in ein anderes Projekt DESSELBEN Kunden verschieben (Entscheidung 05.10.2026).
// Eingabe: { ticket_id, ziel_project_id }
// Rechte: Admin, Führungskraft (Stufe gf in der Personenliste) oder Projektverantwortlicher des Quellprojekts —
// dieselbe Regel wie beim Archivieren (ticketBereinigen).
// Mit wandern: gebuchte Zeiten (Projekt, Sprint, Abrechnungsmodell), Kommentare, Suchindex.
// Abgelehnt wird: archiviertes Ticket, laufender Timer, bereits abgerechnete Zeiten, anderer Kunde.

const ok = (d) => Response.json(d);
const fehler = (text, status = 400) => Response.json({ error: text }, { status });

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return fehler('Unauthorized', 401);

    const { ticket_id: ticketId, ziel_project_id: zielId } = await req.json().catch(() => ({}));
    if (!ticketId || !zielId) return fehler('ticket_id und ziel_project_id fehlen');

    const db = base44.asServiceRole.entities;
    const ticket = await db.Ticket.get(ticketId).catch(() => null);
    if (!ticket) return fehler('Ticket nicht gefunden', 404);
    if (ticket.archiviert) return fehler('Archivierte Tickets lassen sich nicht verschieben.');
    if (ticket.project_id === zielId) return fehler('Das Ticket liegt bereits in diesem Projekt.');

    const [quelle, ziel] = await Promise.all([
      ticket.project_id ? db.Project.get(ticket.project_id).catch(() => null) : null,
      db.Project.get(zielId).catch(() => null),
    ]);
    if (!ziel) return fehler('Zielprojekt nicht gefunden', 404);
    if (ziel.status === 'abgeschlossen') return fehler('Das Zielprojekt ist abgeschlossen.');
    if (quelle?.client_id && ziel.client_id !== quelle.client_id) {
      return fehler('Verschieben geht nur zwischen Projekten desselben Kunden.');
    }

    // Rechte wie beim Archivieren
    const istAdmin = user.role === 'admin';
    const person = istAdmin ? null : (await db.TeamMember.filter({ email: user.email }, 'name', 1))[0];
    const istFuehrung = istAdmin || (person?.system_role === 'gf' && person?.active !== false);
    const istPm = (quelle?.pm_email || '').toLowerCase() === (user.email || '').toLowerCase();
    if (!istFuehrung && !istPm) {
      return fehler('Verboten — nur Projektverantwortliche, Führungskräfte oder Admins', 403);
    }

    const [timer, zeiten] = await Promise.all([
      db.LaufendeZeitbuchung.filter({ ticket_id: ticketId }, null, 10),
      db.TimeEntry.filter({ ticket_id: ticketId }, null, 2000),
    ]);
    if (timer.length) return fehler('Auf diesem Ticket läuft ein Timer — bitte zuerst stoppen.');
    const abgerechnet = zeiten.filter((z) => z.abrechnungsstatus && z.abrechnungsstatus !== 'offen');
    if (abgerechnet.length) {
      return fehler(`${abgerechnet.length} Zeitbuchung(en) sind bereits abgerechnet — das Ticket kann nicht mehr verschoben werden.`);
    }

    // Ziel-Behälter: laufender (sonst erster) Sprint, darin der erste nicht freigegebene Abschnitt
    const sprints = await db.Sprint.filter({ project_id: zielId }, 'start_date', 50);
    const sprint = sprints.find((s) => s.status === 'laufend') || sprints.find((s) => s.status !== 'abgeschlossen') || sprints[0];
    if (!sprint) return fehler('Das Zielprojekt hat noch keinen Arbeitsbereich — bitte dort zuerst eine Aufgabe anlegen.');
    const milestones = await db.Milestone.filter({ sprint_id: sprint.id }, 'order', 50);
    const milestone = milestones.find((m) => !m.released) || milestones[0];
    if (!milestone) return fehler('Das Zielprojekt hat keinen offenen Abschnitt.');

    await db.Ticket.update(ticketId, {
      project_id: zielId,
      milestone_id: milestone.id,
      // Leistungsbereiche gehören zum alten Projekt
      module_template_id: null,
    });

    const kategorie = ziel.abrechnungsmodell || 'sprint';
    await Promise.all(zeiten.map((z) => db.TimeEntry.update(z.id, {
      project_id: zielId,
      client_id: ziel.client_id || z.client_id,
      sprint_id: sprint.id,
      kategorie,
      module_template_id: null,
      ...(ziel.stundensatz ? { stundensatz: ziel.stundensatz } : {}),
    })));

    const kommentare = await db.Comment.filter({ ticket_id: ticketId }, null, 500).catch(() => []);
    await Promise.all(kommentare.map((c) => db.Comment.update(c.id, { project_id: zielId, milestone_id: milestone.id })));

    const index = await db.SearchIndexEntry.filter({ ref_entity: 'Ticket', ref_id: ticketId }, null, 5).catch(() => []);
    await Promise.all(index.map((z) => db.SearchIndexEntry.update(z.id, {
      route: `/sprint/sprints/${sprint.id}?aufgabe=${ticketId}`,
    })));

    const minuten = zeiten.reduce((s, z) => s + (Number(z.duration_minutes) || 0), 0);
    await db.Comment.create({
      project_id: zielId,
      milestone_id: milestone.id,
      ticket_id: ticketId,
      author_email: 'System',
      text: `Verschoben von ${user.full_name || user.email} aus „${quelle?.title || 'unbekanntes Projekt'}" in „${ziel.title}"`
        + (zeiten.length ? ` — ${zeiten.length} Zeitbuchung(en), ${(minuten / 60).toLocaleString('de-AT', { maximumFractionDigits: 2 })} h, mitgenommen.` : '.'),
      created_at: new Date().toISOString(),
    });

    return ok({ ok: true, sprint_id: sprint.id, milestone_id: milestone.id, zeiten: zeiten.length });
  } catch (error) {
    return fehler(error.message, 500);
  }
}
