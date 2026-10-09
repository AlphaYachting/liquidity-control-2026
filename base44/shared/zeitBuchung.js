// Buchen eines laufenden Timers — herausgelöst aus functions/zeitStoppen, damit Stoppen,
// Pause, Gehen und die Automatik dieselbe Regel verwenden. Verhalten identisch zu zeitStoppen:
// erst buchen, dann die laufende Zeile löschen. Wiederholbar über laufende_id.
// `db` = base44.asServiceRole.entities

// Felder einer Buchung aus dem Projekt (Kategorie, Sprint, Stundensatz)
export async function buchungsfelder(db, projectId) {
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

export async function taetigkeitVon(db, kategorie, ticketId) {
  if (ticketId) {
    const ticket = await db.Ticket.get(ticketId).catch(() => null);
    if (ticket) return ticket.role === 'Beratung' ? 'beratung' : 'umsetzung';
  }
  if (kategorie === 'intern') return 'vertrieb';
  if (kategorie === 'aufwand') return 'beratung';
  return 'umsetzung';
}

// Monatsrahmen / Kontingent bei Container, Support und Regie — wie bisher in zeitStoppen.
// ohneId: eine bestehende Buchung, die beim Ändern nicht doppelt zählen darf.
export async function ueberKontingent(db, project, tag, minuten, ohneId = null) {
  const kontingent = Number(project.support_kontingent_stunden) || 0;
  if (!kontingent || minuten <= 0) return false;
  const laufendTyp = !project.is_legacy && ['paket', 'aufwand', 'support'].includes(project.abrechnungsmodell);
  if (!laufendTyp && !project.kontingent_sperre) return false;
  const monat = tag.slice(0, 7);
  const rows = await db.TimeEntry.filter({ project_id: project.id }, '-entry_date', 1000);
  const bisher = rows
    .filter((r) => r.id !== ohneId && String(r.entry_date || '').slice(0, 7) === monat)
    .reduce((s, r) => s + (Number(r.duration_minutes) || 0), 0);
  return bisher + minuten > kontingent * 60;
}

// Laufenden Timer verbuchen. endeIso = Ende der Messung (Serverzeit), abzugMinuten nur im alten Modus.
// Ergebnis: { eintrag, wiederholt }
export async function timerVerbuchen(db, laufende, { notiz = '', endeIso, abzugMinuten = 0, tag } = {}) {
  const schon = await db.TimeEntry.filter({ laufende_id: laufende.id }, '-created_date', 1);
  if (schon[0]) {
    await laufendeEntfernen(db, laufende.person_email);
    return { eintrag: schon[0], wiederholt: true };
  }
  const { felder, kategorie, project } = await buchungsfelder(db, laufende.project_id);
  const art = await taetigkeitVon(db, kategorie, laufende.ticket_id);
  const ende = endeIso ? new Date(endeIso) : new Date();
  const gemessen = Math.max(0, Math.floor((ende.getTime() - new Date(laufende.gestartet_am).getTime()) / 60000));
  const minuten = Math.max(0, gemessen - (Number(abzugMinuten) || 0));
  const buchTag = tag || String(laufende.gestartet_am).slice(0, 10);
  const ueber = await ueberKontingent(db, project, buchTag, minuten);

  const eintrag = await db.TimeEntry.create({
    ...felder,
    ueber_kontingent: ueber,
    ...(laufende.ticket_id ? { ticket_id: laufende.ticket_id } : {}),
    ...(laufende.module_template_id ? { module_template_id: laufende.module_template_id } : {}),
    laufende_id: laufende.id,
    person_email: laufende.person_email,
    entry_date: buchTag,
    started_at: laufende.gestartet_am,
    ended_at: ende.toISOString(),
    duration_minutes: minuten,
    hours: Math.round((minuten / 60) * 100) / 100,
    taetigkeit: art,
    quelle: 'timer',
    note: [...new Set([laufende.notiz, notiz].map((t) => String(t || '').trim()).filter(Boolean))].join(' · '),
    source: 'bestaetigt',
  });
  await laufendeEntfernen(db, laufende.person_email);
  return { eintrag, wiederholt: false, project };
}

export async function laufendeEntfernen(db, email) {
  const alle = await db.LaufendeZeitbuchung.filter({ person_email: email }, '-gestartet_am', 50);
  for (const row of alle) await db.LaufendeZeitbuchung.delete(row.id).catch(() => null);
}

export async function laufendeVon(db, email) {
  const rows = await db.LaufendeZeitbuchung.filter({ person_email: email }, '-gestartet_am', 50);
  return rows[0] || null;
}
