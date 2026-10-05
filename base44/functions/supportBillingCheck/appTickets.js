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