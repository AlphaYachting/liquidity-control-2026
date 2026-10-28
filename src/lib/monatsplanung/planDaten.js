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

// Offene, nicht archivierte Tickets, Team, aktive Projekte, Kunden, Sprints (für Links)
export async function ladePlanung() {
  const [tickets, projekte, kunden, team, sprints] = await Promise.all([
    seitenweise(base44.entities.Ticket, { archiviert: { $ne: true }, status: { $ne: 'erledigt' } }, 'order'),
    base44.entities.Project.filter({ status: 'aktiv' }, '-created_date', 1000),
    base44.entities.Client.list('name', 2000),
    base44.entities.TeamMember.filter({ active: true }, 'name', 200),
    base44.entities.Sprint.list('-created_date', 1000),
  ]);
  return { tickets, projekte, kunden, team, sprints };
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
