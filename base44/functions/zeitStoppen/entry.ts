import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Stoppen in EINEM serverseitigen Aufruf. Reihenfolge ist der Kern: erst buchen,
// dann löschen. Scheitert das Buchen, bleibt der Timer stehen und die gemessene
// Zeit erhalten. Scheitert das Löschen, erkennt der nächste Aufruf die Buchung
// über laufende_id und bucht NICHT ein zweites Mal.
async function buchungsfelder(db, projectId) {
  const [project, sprints] = await Promise.all([
    db.Project.get(projectId),
    db.Sprint.filter({ project_id: projectId }, 'delivery_date', 50),
  ]);
  const kategorie = project.abrechnungsmodell || 'sprint';
  const sprint = sprints
    .filter((s) => s.status === 'laufend')
    .sort((a, b) => (a.delivery_date || '9999-12-31').localeCompare(b.delivery_date || '9999-12-31'))[0];

  let stundensatz;
  if (kategorie === 'aufwand') {
    stundensatz = Number(project.stundensatz) || 0;
    if (!stundensatz) {
      const settings = await db.Setting.filter({ key: 'standard_stundensatz' }, 'key', 1);
      stundensatz = Number(settings[0]?.value) || 0;
    }
  }

  return {
    felder: {
      client_id: project.client_id || '',
      project_id: projectId,
      sprint_id: sprint?.id || '',
      kategorie,
      verrechenbar: kategorie !== 'intern',
      abrechenbar: kategorie !== 'intern',
      ...(kategorie === 'intern' ? { nicht_verrechenbar_grund: 'intern' } : {}),
      abrechnungsstatus: 'offen',
      ...(stundensatz ? { stundensatz } : {}),
    },
    kategorie,
    project,
  };
}

async function taetigkeitVon(db, kategorie, ticketId) {
  if (ticketId) {
    const ticket = await db.Ticket.get(ticketId).catch(() => null);
    if (ticket) return ticket.role === 'Beratung' ? 'beratung' : 'umsetzung';
  }
  if (kategorie === 'intern') return 'vertrieb';
  if (kategorie === 'aufwand') return 'beratung';
  return 'umsetzung';
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 });

    const { laufende_id, notiz = '', abzug_minuten = 0, entry_date } = await req.json().catch(() => ({}));
    if (!laufende_id) return Response.json({ fehler: 'laufende_id fehlt' }, { status: 400 });

    const db = base44.asServiceRole.entities;

    // a) Läuft die Buchung noch? Sonst prüfen, ob dieser Aufruf schon durchlief.
    const laufende = await db.LaufendeZeitbuchung.get(laufende_id).catch(() => null);
    if (!laufende) {
      const schon = await db.TimeEntry.filter({ laufende_id }, '-created_date', 1);
      if (schon[0]) {
        return Response.json({
          erfolg: true,
          wiederholt: true,
          time_entry: schon[0],
          stunden: schon[0].hours,
          minuten: schon[0].duration_minutes,
          projekt_titel: '',
        });
      }
      return Response.json({ fehler: 'nicht gefunden' }, { status: 404 });
    }
    if (laufende.person_email !== user.email) {
      return Response.json({ fehler: 'Fremder Timer' }, { status: 403 });
    }

    // b) Buchungsfelder aus dem Projekt
    const { felder, kategorie } = await buchungsfelder(db, laufende.project_id);
    const art = await taetigkeitVon(db, kategorie, laufende.ticket_id);

    const gemessen = Math.max(0, Math.floor((Date.now() - new Date(laufende.gestartet_am).getTime()) / 60000));
    const minuten = Math.max(0, gemessen - (Number(abzug_minuten) || 0));
    const tag = entry_date || String(laufende.gestartet_am).slice(0, 10);

    // c) Buchung anlegen — schlägt das fehl, wird nichts gelöscht.
    const eintrag = await db.TimeEntry.create({
      ...felder,
      ...(laufende.ticket_id ? { ticket_id: laufende.ticket_id } : {}),
      laufende_id,
      person_email: laufende.person_email,
      entry_date: tag,
      started_at: laufende.gestartet_am,
      ended_at: new Date().toISOString(),
      duration_minutes: minuten,
      hours: Math.round((minuten / 60) * 100) / 100,
      taetigkeit: art,
      quelle: 'timer',
      note: [laufende.notiz, notiz].filter(Boolean).join(' · '),
      source: 'bestaetigt',
    });

    // d) + e) Laufende Buchung entfernen, und dabei je Person aufräumen.
    const alle = await db.LaufendeZeitbuchung.filter({ person_email: laufende.person_email }, '-gestartet_am', 50);
    for (const row of alle) {
      await db.LaufendeZeitbuchung.delete(row.id).catch(() => null);
    }

    return Response.json({
      erfolg: true,
      time_entry: eintrag,
      stunden: eintrag.hours,
      minuten,
      projekt_titel: laufende.projekt_titel || '',
      project_id: laufende.project_id,
      ticket_id: laufende.ticket_id || null,
      entry_date: tag,
    });
  } catch (error) {
    return Response.json({ fehler: error.message }, { status: 500 });
  }
}