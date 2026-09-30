import { base44 } from '@/api/base44Client';
import { projectTypeOf } from '@/components/sprint/projectTypes';
import { ladeStammdaten } from './zeitDaten';

// Leistungsbereich = Modul, nur bei Container-Projekten.
export async function istContainerProjekt(projectId) {
  if (!projectId) return false;
  // Aus den bereits geladenen Stammdaten — spart eine Anfrage je Projektwahl
  const { projects } = await ladeStammdaten();
  const p = projects.find((x) => x.id === projectId)
    || await base44.entities.Project.get(projectId).catch(() => null);
  return projectTypeOf(p) === 'container';
}

// Distinkte Module, aus denen dieses Projekt Tickets hat.
export async function bereicheVonProjekt(projectId) {
  const tickets = await base44.entities.Ticket.filter({ project_id: projectId }, 'order', 1000);
  const ids = [...new Set(tickets.map((t) => t.module_template_id).filter(Boolean))];
  if (!ids.length) return [];
  const module = await base44.entities.ModuleTemplate.filter({ id: { $in: ids } }, 'name', 200);
  return module.map((m) => ({ id: m.id, name: m.name }));
}

export async function letzterBereich(email, projectId) {
  const rows = await base44.entities.TimeEntry.filter({ person_email: email, project_id: projectId }, '-started_at', 20);
  return rows.find((r) => r.module_template_id)?.module_template_id || null;
}

// Vorbelegung: Ticket → letzte Buchung → keiner.
export async function vorbelegeBereich({ projectId, ticketId, email }) {
  if (!(await istContainerProjekt(projectId))) return null;
  if (ticketId) {
    const t = await base44.entities.Ticket.get(ticketId).catch(() => null);
    if (t?.module_template_id) return t.module_template_id;
  }
  return letzterBereich(email, projectId);
}