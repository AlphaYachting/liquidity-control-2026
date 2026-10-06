// App-Quelle der Support-Abrechnung: erledigte Support-Tickets + offene, verrechenbare Zeitbuchungen.

// Identische Kopie von supportVerrechnungsMinuten aus src/lib/zeit/rundung.js —
// Minimum 30 Minuten, darüber auf volle 15 Minuten aufgerundet, 0 bleibt 0.
export function supportVerrechnungsMinuten(minuten) {
  const m = Number(minuten) || 0;
  if (m <= 0) return 0;
  return Math.max(30, Math.ceil(m / 15) * 15);
}

const SUPPORT_MODELS = ['aufwand', 'support'];
const SATZ = 130;
const istSupportProjekt = (p) => SUPPORT_MODELS.includes(p.abrechnungsmodell) && p.aufwand_art !== 'regie';
const istOffen = (e) => e.verrechenbar !== false && (e.abrechnungsstatus || 'offen') === 'offen';
const istAbgerechnet = (e) => e.abrechnungsstatus === 'abgerechnet';

export async function appZeilen(sr, alleSeiten, liveStatus, anweisungen) {
  const projekte = (await alleSeiten((l, o) => sr.entities.Project.list('-created_date', l, o))).filter(istSupportProjekt);
  const projektById = Object.fromEntries(projekte.map(p => [p.id, p]));
  const clients = await alleSeiten((l, o) => sr.entities.Client.list('-created_date', l, o));
  const clientById = Object.fromEntries(clients.map(c => [c.id, c]));
  const team = await alleSeiten((l, o) => sr.entities.TeamMember.list('name', l, o));
  const nameByEmail = Object.fromEntries(team.map(t => [String(t.email || '').toLowerCase(), t.name]));

  const tickets = (await alleSeiten((l, o) => sr.entities.Ticket.filter({ status: 'erledigt' }, '-updated_date', l, o)))
    .filter(t => projektById[t.project_id] && t.archiviert !== true);
  const ticketById = Object.fromEntries(tickets.map(t => [t.id, t]));

  const buchungen = [];
  for (const p of projekte) {
    buchungen.push(...await alleSeiten((l, o) => sr.entities.TimeEntry.filter({ project_id: p.id }, '-entry_date', l, o)));
  }

  const gruppen = {};
  const gruppe = (p) => {
    const c = clientById[p.client_id] || null;
    const key = `app:${p.client_id || p.id}`;
    if (!gruppen[key]) {
      gruppen[key] = {
        group_key: key, quelle: 'app', client_id: p.client_id || '',
        customer_name: c?.name || p.title, sevdesk_contact_id: c?.sevdesk_contact_id || '',
        project_name: p.title, liquidity_project_id: p.liquidity_project_id || '',
        stundensatz: Number(p.stundensatz) || SATZ,
        open_minutes: 0, billable_minutes: 0, vorleistung_minutes: 0,
        tasks: [], ohne_zeit: [], instructions: [], nicht_verrechnet: [],
      };
    }
    return gruppen[key];
  };

  // Offene Zeit je Ticket bzw. je Projekt ohne Ticket
  const proTicket = {};
  const ohneTicket = {};
  const hatAbgerechnet = new Set();
  for (const e of buchungen) {
    if (e.ticket_id && istAbgerechnet(e)) hatAbgerechnet.add(e.ticket_id);
    if (!istOffen(e)) continue;
    let ziel;
    if (e.ticket_id) {
      if (!ticketById[e.ticket_id]) continue; // Ticket noch nicht erledigt oder archiviert
      ziel = proTicket[e.ticket_id] = proTicket[e.ticket_id] || { minuten: 0, ids: [], letzte: null };
    } else {
      ziel = ohneTicket[e.project_id] = ohneTicket[e.project_id] || { minuten: 0, ids: [], letzte: null };
    }
    ziel.minuten += Number(e.duration_minutes) || 0;
    ziel.ids.push(e.id);
    if (!ziel.letzte || (e.entry_date || '') > ziel.letzte) ziel.letzte = e.entry_date || null;
  }

  // Zusammenführen (06.10.2026): Ein erledigtes Ticket ohne Zeit und daneben Zeit ohne Ticket
  // im selben Support-Projekt sind fast immer dieselbe Arbeit — der Timer wurde am Projekt statt
  // am Ticket gestartet. Dann wird die Zeit dem Ticket zugeordnet, statt zwei Positionen mit je
  // 0,5 h Minimum zu bilden. Nur wenn es eindeutig ist:
  //  - genau EIN erledigtes, noch zu verrechnendes Ticket des Projekts hat keine eigene Zeit,
  //  - das Projekt hat kein offenes Ticket, dem die Zeit sonst gehören könnte,
  //  - die Zeit ist nicht nach dem Erledigt-Tag gebucht.
  // Die Daten selbst bleiben unverändert; erst beim Abrechnen wird die Ticketzuordnung gespeichert.
  const offenOhneZeit = (t) => {
    const vstatus = t.verrechnung_status || 'offen';
    if (vstatus !== 'offen') return false;
    if ((proTicket[t.id]?.minuten || 0) > 0) return false;
    if (Number(t.awork_vorleistung_minuten) > 0 && !t.awork_vorleistung_abgerechnet) return false;
    if (hatAbgerechnet.has(t.id) || t.awork_vorleistung_abgerechnet) return false;
    return true;
  };
  const zugeordnet = {}; // ticketId -> { minuten, ids }
  for (const [projectId, z] of Object.entries(ohneTicket)) {
    const kandidaten = tickets.filter(t => t.project_id === projectId && offenOhneZeit(t));
    if (kandidaten.length !== 1) continue;
    const t = kandidaten[0];
    const erledigtTag = String(t.last_status_change || t.updated_date || '').slice(0, 10);
    const eintraege = buchungen.filter(e => z.ids.includes(e.id));
    if (erledigtTag && eintraege.some(e => String(e.entry_date || '') > erledigtTag)) continue;
    const offeneTickets = await sr.entities.Ticket
      .filter({ project_id: projectId, status: { $ne: 'erledigt' }, archiviert: { $ne: true } }, '-updated_date', 1)
      .catch(() => [{}]);
    if (offeneTickets.length) continue;
    proTicket[t.id] = { minuten: z.minuten, ids: [...z.ids], letzte: z.letzte };
    zugeordnet[t.id] = { minuten: z.minuten, ids: [...z.ids] };
    delete ohneTicket[projectId];
  }

  const vor30Tagen = new Date(Date.now() - 30 * 864e5).toISOString();
  for (const t of tickets) {
    const z = proTicket[t.id] || { minuten: 0, ids: [], letzte: null };
    const vorleistung = Number(t.awork_vorleistung_minuten) > 0 && !t.awork_vorleistung_abgerechnet ? Number(t.awork_vorleistung_minuten) : 0;
    const g = gruppe(projektById[t.project_id]);
    const link = `/sprint/milestones/${t.milestone_id}?aufgabe=${t.id}`;
    const vstatus = t.verrechnung_status || 'offen';
    // Bewusst nicht verrechnet: 30 Tage sichtbar (zum Rückgängigmachen), keine Position
    if (vstatus === 'nicht_verrechnen') {
      if ((t.verrechnung_am || '') >= vor30Tagen) {
        g.nicht_verrechnet.push({
          ticket_id: t.id, task_title: t.title, link, grund: t.verrechnung_grund || '',
          notiz: t.verrechnung_notiz || '', von: t.verrechnung_von || '', am: t.verrechnung_am || null,
        });
      }
      continue;
    }
    if (vstatus === 'verrechnet') continue;
    const offen = z.minuten + vorleistung;
    // Ohne offene Zeit, aber schon über die App verrechnet (Altfall vor den Verrechnungsfeldern) → keine Position
    if (offen <= 0 && (hatAbgerechnet.has(t.id) || t.awork_vorleistung_abgerechnet)) continue;
    const posten = {
      key: t.id, ticket_id: t.id, project_id: t.project_id, task_title: t.title,
      assignee_name: nameByEmail[String(t.assignee_email || '').toLowerCase()] || t.assignee_email || '',
      last_entry_date: z.letzte, open_minutes: offen, vorleistung_minutes: vorleistung,
      billable_minutes: supportVerrechnungsMinuten(offen), time_entry_ids: z.ids,
      link,
      ohne_zeit: offen <= 0,
      target_hours: Number(t.target_hours) || null,
      erledigt_am: t.last_status_change || null,
      awork_task_id: t.awork_task_id || null,
      // Zeit, die ohne Ticket gebucht war und diesem Ticket zugeordnet wurde
      zugeordnet_minuten: zugeordnet[t.id]?.minuten || 0,
      zugeordnet_ids: zugeordnet[t.id]?.ids || [],
    };
    g.tasks.push(posten);
    g.open_minutes += offen;
    g.vorleistung_minutes += vorleistung;
    g.billable_minutes += posten.billable_minutes;
  }

  for (const [projectId, z] of Object.entries(ohneTicket)) {
    const p = projektById[projectId];
    const g = gruppe(p);
    const posten = {
      key: `ohne:${projectId}`, ticket_id: null, project_id: projectId, task_title: 'Zeit ohne Ticket', assignee_name: '',
      last_entry_date: z.letzte, open_minutes: z.minuten, vorleistung_minutes: 0,
      billable_minutes: supportVerrechnungsMinuten(z.minuten), time_entry_ids: z.ids, link: null,
      ohne_zeit: false, target_hours: null, erledigt_am: null, awork_task_id: null,
    };
    g.tasks.push(posten);
    g.open_minutes += z.minuten;
    g.billable_minutes += posten.billable_minutes;
  }

  // App-Anweisungen je Kunde — bleiben sichtbar (zum Zurücknehmen), bis sie bezahlt sind
  for (const a of anweisungen) {
    let snap = null;
    try { snap = a.source_snapshot_json ? JSON.parse(a.source_snapshot_json) : null; } catch (_e) { snap = null; }
    if (snap?.quelle !== 'app' || a.status === 'cancelled' || a.status === 'paid') continue;
    const g = Object.values(gruppen).find(x => x.client_id && x.client_id === snap.client_id)
      || (snap.project_id && projektById[snap.project_id] ? gruppe(projektById[snap.project_id]) : null);
    if (!g) continue;
    const live = await liveStatus(a.sevdesk_invoice_id);
    if (live?.status_code === '1000') continue;
    g.instructions.push({
      id: a.id, amount_net: a.instruction_amount_net || 0, status: a.status,
      sevdesk_invoice_id: a.sevdesk_invoice_id || null, sevdesk_invoice_url: a.sevdesk_invoice_url || null,
      live_status: live,
    });
  }

  const rows = Object.values(gruppen)
    .filter(g => g.tasks.length || g.nicht_verrechnet.length || g.instructions.length)
    .sort((a, b) => b.open_minutes - a.open_minutes);
  return { rows, support_projects: projekte.length };
}
// ─────────────────────────────────────────────────────────────────────────────
// Regie — Aufträge nach Aufwand auf Zuruf (Project.aufwand_art = 'regie').
// Bis zur aWork-Abschaltung lief Regie über die aWork-Supportabrechnung; die
// App-Supportabrechnung oben schließt Regie bewusst aus (anderes Modell: keine
// Ticketpflicht, kein Minimum je Ticket). Hier: alle offenen, verrechenbaren
// Buchungen je Regie-Projekt — gebündelt je Aufgabe bzw. „ohne Aufgabe".
// Gerundet wird nach den Regeln am Projekt, sonst Setting 'regie.*', sonst Regie-Vorgabe
// (mindestens 15 Minuten, auf 15 Minuten aufgerundet, je Tag und Projekt).
// Buchungen bis zum aWork-Stichtag stehen als eigene Position „vor der Umstellung"
// und sind im Rechnungsdialog nicht vorausgewählt — sie können in aWork schon
// gebucht und verrechnet sein.

// Regie: mindestens 15 Minuten, auf volle 15 Minuten aufgerundet — je Tag und Projekt
// (Entscheidung Alfons 05.10.2026). Identisch mit RUNDUNG_VORGABEN.regie in src/lib/zeit/rundung.js.
const RUNDUNG_VORGABE_REGIE = { rundung_minuten: 15, rundung_art: 'auf', rundung_basis: 'tag_projekt', mindestbuchung_minuten: 15 };
const RUNDUNG_FELDER = ['rundung_minuten', 'rundung_art', 'rundung_basis', 'mindestbuchung_minuten'];

function regelnFuer(project, settings) {
  const regeln = {};
  for (const f of RUNDUNG_FELDER) {
    const amProjekt = project?.[f];
    const ausSetting = settings[`regie.${f}`];
    regeln[f] = amProjekt !== undefined && amProjekt !== null && amProjekt !== ''
      ? amProjekt
      : (ausSetting !== undefined && ausSetting !== null && ausSetting !== '' ? ausSetting : RUNDUNG_VORGABE_REGIE[f]);
  }
  regeln.rundung_minuten = Number(regeln.rundung_minuten) || 0;
  regeln.mindestbuchung_minuten = Number(regeln.mindestbuchung_minuten) || 0;
  return regeln;
}

const runde = (minuten, schritt, art) => {
  if (!schritt || minuten <= 0) return Math.max(0, minuten);
  const teile = minuten / schritt;
  return (art === 'kaufmaennisch' ? Math.round(teile) : Math.ceil(teile)) * schritt;
};

// Verrechnete Minuten je Position. Basis 'buchung': jede Buchung für sich gerundet.
// Basis 'tag_projekt': je Tag wird die Summe des ganzen Projekts gerundet (Minimum gilt
// je Tag und Projekt, nicht je Aufgabe); der Rundungsaufschlag eines Tages geht an die
// Position mit den meisten Minuten an diesem Tag. Rückgabe: { [positionKey]: Minuten }
function verrechnetJePosition(positionen, regeln) {
  const ergebnis = Object.fromEntries(positionen.map(p => [p.key, 0]));
  if (regeln.rundung_basis === 'buchung') {
    for (const p of positionen) {
      ergebnis[p.key] = p.entries.reduce((s, e) => s + Math.max(runde(Number(e.duration_minutes) || 0, regeln.rundung_minuten, regeln.rundung_art), regeln.mindestbuchung_minuten), 0);
    }
    return ergebnis;
  }
  const tage = {};
  for (const p of positionen) {
    for (const e of p.entries) {
      const tag = e.entry_date || 'ohne';
      const t = tage[tag] = tage[tag] || {};
      t[p.key] = (t[p.key] || 0) + (Number(e.duration_minutes) || 0);
    }
  }
  for (const proPos of Object.values(tage)) {
    const summe = Object.values(proPos).reduce((s, m) => s + m, 0);
    const gerundet = summe > 0 ? Math.max(runde(summe, regeln.rundung_minuten, regeln.rundung_art), regeln.mindestbuchung_minuten) : summe;
    const groesste = Object.entries(proPos).sort((a, b) => b[1] - a[1])[0][0];
    for (const [key, min] of Object.entries(proPos)) ergebnis[key] += min;
    ergebnis[groesste] += gerundet - summe;
  }
  return ergebnis;
}

export async function regieZeilen(sr, alleSeiten, liveStatus, anweisungen) {
  const alle = await alleSeiten((l, o) => sr.entities.Project.list('-created_date', l, o));
  const projekte = alle.filter(p => p.abrechnungsmodell === 'aufwand' && p.aufwand_art === 'regie');
  if (!projekte.length) return { rows: [], regie_projects: 0 };

  const settingRows = await sr.entities.Setting.filter({ group: 'abrechnung' }, 'key', 200).catch(() => []);
  const settings = Object.fromEntries(settingRows.map(s => [s.key, s.value]));
  const standardSatz = Number(settings.standard_stundensatz) || 120;
  const umstellung = String(settings.awork_umstellung_stichtag || '2026-10-04').slice(0, 10);

  const clients = await alleSeiten((l, o) => sr.entities.Client.list('-created_date', l, o));
  const clientById = Object.fromEntries(clients.map(c => [c.id, c]));
  const team = await alleSeiten((l, o) => sr.entities.TeamMember.list('name', l, o));
  const nameByEmail = Object.fromEntries(team.map(t => [String(t.email || '').toLowerCase(), t.name]));

  const rows = [];
  for (const p of projekte) {
    const buchungen = (await alleSeiten((l, o) => sr.entities.TimeEntry.filter({ project_id: p.id }, '-entry_date', l, o)))
      .filter(istOffen)
      .filter(e => (Number(e.duration_minutes) || 0) !== 0);

    const offeneAnweisungen = [];
    for (const a of anweisungen) {
      let snap = null;
      try { snap = a.source_snapshot_json ? JSON.parse(a.source_snapshot_json) : null; } catch (_e) { snap = null; }
      if (snap?.quelle !== 'regie' || snap.regie_project_id !== p.id || a.status === 'cancelled' || a.status === 'paid') continue;
      const live = await liveStatus(a.sevdesk_invoice_id);
      if (live?.status_code === '1000') continue;
      offeneAnweisungen.push({
        id: a.id, amount_net: a.instruction_amount_net || 0, status: a.status,
        sevdesk_invoice_id: a.sevdesk_invoice_id || null, sevdesk_invoice_url: a.sevdesk_invoice_url || null,
        live_status: live,
      });
    }
    if (!buchungen.length && !offeneAnweisungen.length) continue;

    const regeln = regelnFuer(p, settings);
    const satz = Number(p.stundensatz) || Number(buchungen.find(e => Number(e.stundensatz) > 0)?.stundensatz) || standardSatz;
    const c = clientById[p.client_id] || null;

    // Titel der Aufgaben (auch offene — Regie wird nicht erst bei „erledigt" verrechnet)
    const ticketIds = [...new Set(buchungen.map(e => e.ticket_id).filter(Boolean))];
    const tickets = ticketIds.length ? await sr.entities.Ticket.filter({ id: { $in: ticketIds } }, 'order', 500).catch(() => []) : [];
    const ticketById = Object.fromEntries(tickets.map(t => [t.id, t]));

    const positionen = {};
    for (const e of buchungen) {
      const vor = String(e.entry_date || '') <= umstellung;
      const key = vor ? `vor:${p.id}` : (e.ticket_id && ticketById[e.ticket_id] ? e.ticket_id : `ohne:${p.id}`);
      const pos = positionen[key] = positionen[key] || { key, ticket_id: vor ? null : (ticketById[e.ticket_id] ? e.ticket_id : null), vorbehalt: vor, entries: [], personen: new Set() };
      pos.entries.push(e);
      if (e.person_email) pos.personen.add(nameByEmail[String(e.person_email).toLowerCase()] || e.person_email);
    }

    const verrechnetMin = verrechnetJePosition(Object.values(positionen), regeln);
    const tasks = Object.values(positionen).map(pos => {
      const t = pos.ticket_id ? ticketById[pos.ticket_id] : null;
      const minuten = pos.entries.reduce((s, e) => s + (Number(e.duration_minutes) || 0), 0);
      const letzte = pos.entries.reduce((m, e) => ((e.entry_date || '') > m ? e.entry_date : m), '');
      const erste = pos.entries.reduce((m, e) => (!m || (e.entry_date || '') < m ? e.entry_date : m), '');
      const notizen = [...new Set(pos.entries.map(e => String(e.note || '').trim()).filter(Boolean))];
      return {
        key: pos.key,
        ticket_id: pos.ticket_id,
        project_id: p.id,
        task_title: pos.vorbehalt
          ? `Buchungen bis ${umstellung.slice(8, 10)}.${umstellung.slice(5, 7)}. — vor der Umstellung, mit aWork abgleichen`
          : (t ? t.title : 'Regieleistungen ohne Aufgabe'),
        assignee_name: [...pos.personen].join(', '),
        last_entry_date: letzte || null,
        first_entry_date: erste || null,
        open_minutes: minuten,
        vorleistung_minutes: 0,
        billable_minutes: verrechnetMin[pos.key],
        time_entry_ids: pos.entries.map(e => e.id),
        link: t ? `/sprint/milestones/${t.milestone_id}?aufgabe=${t.id}` : null,
        ohne_zeit: false,
        vorbehalt: pos.vorbehalt,
        notizen,
        target_hours: t ? (Number(t.target_hours) || null) : null,
        erledigt_am: null,
        awork_task_id: null,
      };
    }).sort((a, b) => Number(a.vorbehalt) - Number(b.vorbehalt) || b.open_minutes - a.open_minutes);

    rows.push({
      group_key: `regie:${p.id}`,
      art: 'regie',
      quelle: 'regie',
      client_id: p.client_id || '',
      customer_name: c?.name || p.title,
      sevdesk_contact_id: c?.sevdesk_contact_id || '',
      project_id: p.id,
      project_name: p.title,
      liquidity_project_id: p.liquidity_project_id || '',
      stundensatz: satz,
      rundung: regeln,
      open_minutes: tasks.reduce((s, t) => s + t.open_minutes, 0),
      billable_minutes: tasks.filter(t => !t.vorbehalt).reduce((s, t) => s + t.billable_minutes, 0),
      vorbehalt_minutes: tasks.filter(t => t.vorbehalt).reduce((s, t) => s + t.open_minutes, 0),
      vorleistung_minutes: 0,
      tasks,
      ohne_zeit: [],
      instructions: offeneAnweisungen,
      nicht_verrechnet: [],
    });
  }

  rows.sort((a, b) => b.open_minutes - a.open_minutes);
  return { rows, regie_projects: projekte.length };
}
