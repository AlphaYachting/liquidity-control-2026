import { base44 } from '@/api/base44Client';

// MONATSPLANUNG — Daten laden. Liest nur; geschrieben wird ausschließlich das Häkchen
// „verfügbar“ je Person und Monat (PlanVerfuegbarkeit).

const SEITE = 500;

async function seitenweise(entity, query, sort) {
  const alle = [];
  for (let skip = 0; ; skip += SEITE) {
    const seite = await entity.filter(query, sort, SEITE, skip);
    alle.push(...seite);
    if (seite.length < SEITE) break;
  }
  return alle;
}

// App-Buchungen je Ticket in Stunden, in Blöcken abgefragt
async function appStunden(ticketIds) {
  const out = {};
  for (let i = 0; i < ticketIds.length; i += 100) {
    const rows = await base44.entities.TimeEntry.filter({ ticket_id: { $in: ticketIds.slice(i, i + 100) } }, '-entry_date', 5000);
    rows.forEach((e) => { out[e.ticket_id] = (out[e.ticket_id] || 0) + (e.duration_minutes || 0) / 60; });
  }
  return out;
}

// In aWork gebuchte Stunden je Ticket — über aWork-Projekt und Titel (bzw. letzten Abschnitt nach „ › “),
// jüngster Snapshot gewinnt. Gleiche Zuordnung wie im früheren Auslastungsforecast.
async function aworkStunden(tickets, projekte) {
  const aworkVon = Object.fromEntries(projekte.filter((p) => p.awork_project_id).map((p) => [p.id, p.awork_project_id]));
  const ids = [...new Set(Object.values(aworkVon))];
  const snaps = [];
  for (let i = 0; i < ids.length; i += 50) {
    snaps.push(...await seitenweise(base44.entities.AworkTaskSnapshot, { awork_project_id: { $in: ids.slice(i, i + 50) } }, '-last_synced_at'));
  }
  const norm = (s) => (s || '').trim().toLowerCase();
  const index = {};
  snaps.forEach((s) => {
    const k = `${s.awork_project_id}|${norm(s.task_title)}`;
    if (!index[k] || (s.last_synced_at || '') > (index[k].last_synced_at || '')) index[k] = s;
  });
  const out = {};
  tickets.forEach((t) => {
    const aw = aworkVon[t.project_id];
    if (!aw) return;
    const teile = (t.title || '').split(' › ');
    const treffer = index[`${aw}|${norm(t.title)}`] || (teile.length > 1 ? index[`${aw}|${norm(teile[teile.length - 1])}`] : null);
    if (treffer) out[t.id] = (treffer.tracked_duration_minutes || 0) / 60;
  });
  return out;
}

// Offene, nicht archivierte Tickets, Team, aktive Projekte, Kunden, Sprints (für Links)
// und bereits geleistete Stunden je Ticket (App + aWork), damit die Zeitvorgabe nicht doppelt zählt.
export async function ladePlanung() {
  const [tickets, projekte, kunden, team, sprints] = await Promise.all([
    seitenweise(base44.entities.Ticket, { archiviert: { $ne: true }, status: { $ne: 'erledigt' } }, 'order'),
    base44.entities.Project.filter({ status: 'aktiv' }, '-created_date', 1000),
    base44.entities.Client.list('name', 2000),
    base44.entities.TeamMember.filter({ active: true }, 'name', 200),
    base44.entities.Sprint.list('-created_date', 1000),
  ]);
  const aktiveIds = new Set(projekte.map((p) => p.id));
  const relevante = tickets.filter((t) => aktiveIds.has(t.project_id));
  const [app, awork] = await Promise.all([appStunden(relevante.map((t) => t.id)), aworkStunden(relevante, projekte)]);
  const geleistet = {};
  relevante.forEach((t) => { geleistet[t.id] = (app[t.id] || 0) + (awork[t.id] || 0); });
  return { tickets, projekte, kunden, team, sprints, geleistet };
}

// Häkchen eines Monats
export async function ladeVerfuegbarkeit(monat) {
  return base44.entities.PlanVerfuegbarkeit.filter({ monat }, 'person_email', 500);
}

// Häkchen setzen — legt den Eintrag an oder ändert den vorhandenen
export async function setzeVerfuegbar({ monat, email, verfuegbar, vorhanden }) {
  const person_email = String(email || '').trim().toLowerCase();
  if (vorhanden?.id) return base44.entities.PlanVerfuegbarkeit.update(vorhanden.id, { verfuegbar });
  const frisch = (await base44.entities.PlanVerfuegbarkeit.filter({ monat, person_email }, 'person_email', 1))[0];
  if (frisch) return base44.entities.PlanVerfuegbarkeit.update(frisch.id, { verfuegbar });
  return base44.entities.PlanVerfuegbarkeit.create({ monat, person_email, verfuegbar });
}
