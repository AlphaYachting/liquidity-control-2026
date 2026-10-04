import { base44 } from '@/api/base44Client';
import { kundenSchluessel } from '@/lib/kunden/kundeAnlegen';
import { resolveSupportProject } from '@/components/crm/support/supportTicket';

// Offene aWork-Support-Aufgaben einmalig als App-Tickets übernehmen.
export const AWORK_SUPPORT_PROJEKT = 'a523ca25-5b9c-eb11-a607-00155d314496';
const STICHTAG = '2026-07-24';
const STATUS = { 'to do': 'offen', 'in bearbeitung': 'in_arbeit', 'in überprüfung': 'wartet' };

async function alle(fn) {
  const out = [];
  for (let skip = 0; skip < 20000; skip += 500) {
    const seite = await fn(500, skip);
    out.push(...seite);
    if (seite.length < 500) break;
  }
  return out;
}

const teileTitel = (titel) => {
  const i = String(titel || '').indexOf(' - ');
  return i > 0 ? { praefix: titel.slice(0, i).trim(), rest: titel.slice(i + 3).trim() } : { praefix: '', rest: String(titel || '').trim() };
};

function kundeZu(praefix, clients) {
  const k = kundenSchluessel(praefix);
  if (!k) return null;
  const exakt = clients.find(c => kundenSchluessel(c.name) === k);
  if (exakt) return exakt;
  const beginnt = clients.filter(c => kundenSchluessel(c.name).startsWith(k));
  return beginnt.length === 1 ? beginnt[0] : null;
}

export async function ladeVorschau() {
  const [aufgaben, clients, team, tickets, buchungen] = await Promise.all([
    alle((l, s) => base44.entities.AworkTaskSnapshot.filter({ awork_project_id: AWORK_SUPPORT_PROJEKT, is_done: false }, '-last_activity_at', l, s)),
    base44.entities.Client.list('name', 5000),
    base44.entities.TeamMember.list('name', 500),
    alle((l, s) => base44.entities.Ticket.filter({ origin: 'support' }, '-created_date', l, s)),
    alle((l, s) => base44.entities.AworkTimeEntry.filter({ is_billable: true, is_billed: false }, '-entry_date', l, s)),
  ]);
  const vorhanden = new Set(tickets.map(t => t.awork_task_id).filter(Boolean));
  const minuten = {};
  buchungen.forEach(b => {
    if (b.task_id && (b.entry_date || '') >= STICHTAG) minuten[b.task_id] = (minuten[b.task_id] || 0) + (Number(b.duration_minutes) || 0);
  });
  const emailZuName = (name) => team.find(m => kundenSchluessel(m.name) && kundenSchluessel(m.name) === kundenSchluessel(name))?.email || '';

  const eintraege = aufgaben
    .filter(a => a.task_status_name !== 'In Verrechnung')
    .map(a => {
      const { praefix, rest } = teileTitel(a.task_title);
      return {
        awork_task_id: a.awork_task_id,
        titel: rest || a.task_title,
        praefix,
        aw_status: a.task_status_name || '',
        status: STATUS[String(a.task_status_name || '').toLowerCase()] || 'offen',
        assignee_name: a.assignee_name || '',
        assignee_email: emailZuName(a.assignee_name),
        vorleistung_minuten: minuten[a.awork_task_id] || 0,
        client_id: kundeZu(praefix, clients)?.id || '',
        bereits: vorhanden.has(a.awork_task_id),
      };
    });
  return { eintraege, clients };
}

export async function uebernehmen(eintraege, clients) {
  const ergebnis = { uebernommen: 0, uebersprungen: 0, kunde_fehlt: 0 };
  const ziele = {};
  for (const e of eintraege) {
    if (!e.client_id) { ergebnis.kunde_fehlt++; continue; }
    const doppelt = await base44.entities.Ticket.filter({ awork_task_id: e.awork_task_id });
    if (e.bereits || doppelt.length) { ergebnis.uebersprungen++; continue; }
    const client = clients.find(c => c.id === e.client_id);
    if (!ziele[client.id]) ziele[client.id] = await resolveSupportProject(client.name, { stundensatz: 130 });
    const { project_id, milestone_id } = ziele[client.id];
    await base44.entities.Ticket.create({
      project_id, milestone_id,
      title: e.titel,
      description: `Übernommen aus aWork (Status „${e.aw_status}")`,
      origin: 'support',
      status: e.status,
      customer_name: client.name,
      assignee_email: e.assignee_email || undefined,
      awork_task_id: e.awork_task_id,
      awork_vorleistung_minuten: e.vorleistung_minuten,
      awork_vorleistung_abgerechnet: false,
    });
    ergebnis.uebernommen++;
  }
  return ergebnis;
}