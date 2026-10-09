import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { modusFuer, wienTag } from '../../shared/arbeitszeitKern.js';
import { ladeEinstellungen } from '../../shared/arbeitszeitDaten.js';

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
  // Laufender Sprint; läuft noch keiner, der nächste geplante — gleiche Regel wie
  // in src/lib/sprint/buchungsfelder.js und projektZeitSummen.
  const sprint = sprints
    .filter((s) => s.status === 'laufend')
    .sort((a, b) => (a.delivery_date || '9999-12-31').localeCompare(b.delivery_date || '9999-12-31'))[0]
    || sprints
      .filter((s) => s.status === 'geplant')
      .sort((a, b) => (a.start_date || '9999-12-31').localeCompare(b.start_date || '9999-12-31'))[0];

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
    const { felder, kategorie, project } = await buchungsfelder(db, laufende.project_id);
    const art = await taetigkeitVon(db, kategorie, laufende.ticket_id);

    const gemessen = Math.max(0, Math.floor((Date.now() - new Date(laufende.gestartet_am).getTime()) / 60000));
    // Neue Arbeitszeiterfassung (Pilot oder ab Stichtag): gemessen ist gemessen — kein Abzug von Hand.
    // Im alten Modus unverändert.
    const einst = await ladeEinstellungen(db);
    const neuerModus = modusFuer(String(user.email).toLowerCase(), wienTag(new Date()), einst).neu;
    const minuten = Math.max(0, gemessen - (neuerModus ? 0 : (Number(abzug_minuten) || 0)));
    const tag = entry_date || String(laufende.gestartet_am).slice(0, 10);

    // Kontingent/Monatsrahmen bei Container, Support und Regie prüfen
    let ueber = false;
    const kontingent = Number(project.support_kontingent_stunden) || 0;
    const laufendTyp = !project.is_legacy && ['paket', 'aufwand', 'support'].includes(project.abrechnungsmodell);
    if (laufendTyp && kontingent && minuten > 0) {
      const monat = tag.slice(0, 7);
      const rows = await db.TimeEntry.filter({ project_id: laufende.project_id }, '-entry_date', 500);
      const bisher = rows
        .filter((r) => String(r.entry_date || '').slice(0, 7) === monat)
        .reduce((s, r) => s + (Number(r.duration_minutes) || 0), 0);
      ueber = bisher + minuten > kontingent * 60;
    }
    // Buchungssperre: ein laufender Timer wird immer gebucht, über dem Kontingent nur markiert.
    if (!ueber && project.kontingent_sperre && kontingent && minuten > 0) {
      const monat = tag.slice(0, 7);
      const rows = await db.TimeEntry.filter({ project_id: laufende.project_id }, '-entry_date', 1000);
      const bisher = rows
        .filter((r) => String(r.entry_date || '').slice(0, 7) === monat)
        .reduce((s, r) => s + (Number(r.duration_minutes) || 0), 0);
      ueber = bisher + minuten > kontingent * 60;
    }

    // c) Buchung anlegen — schlägt das fehl, wird nichts gelöscht.
    const eintrag = await db.TimeEntry.create({
      ...felder,
      ueber_kontingent: ueber,
      ...(laufende.ticket_id ? { ticket_id: laufende.ticket_id } : {}),
      ...(laufende.module_template_id ? { module_template_id: laufende.module_template_id } : {}),
      laufende_id,
      person_email: laufende.person_email,
      entry_date: tag,
      started_at: laufende.gestartet_am,
      ended_at: new Date().toISOString(),
      duration_minutes: minuten,
      hours: Math.round((minuten / 60) * 100) / 100,
      taetigkeit: art,
      quelle: 'timer',
      // Notiz vom Start und vom Stoppen — ist sie gleich, nur einmal (sonst steht „X · X“ in der Buchung)
      note: [...new Set([laufende.notiz, notiz].map((t) => String(t || '').trim()).filter(Boolean))].join(' · '),
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