import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { darfVerwalten, altstandNeuBerechnen } from '../../shared/kontingentLaufzeit.js';

// aWork-Altstand für Retainer-Projekte (neu) berechnen.
// Eingabe { project_id } oder { alle: true }. Schreibt nur auf Project, nie auf TimeEntry/AworkTimeEntry.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!darfVerwalten(user)) return Response.json({ error: 'Verboten — nur GF/PM' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const db = base44.asServiceRole.entities;

    const istRetainer = (p) =>
      p.abrechnungsmodell === 'paket' && !p.is_legacy && (Number(p.support_kontingent_stunden) || 0) > 0;

    let projects = [];
    if (body.alle) {
      const all = await db.Project.list('-created_date', 2000);
      projects = all.filter(istRetainer);
    } else {
      if (!body.project_id) return Response.json({ error: 'project_id oder alle fehlt' }, { status: 400 });
      const project = await db.Project.get(body.project_id);
      if (!project) return Response.json({ error: 'Projekt nicht gefunden' }, { status: 404 });
      if (!istRetainer(project)) return Response.json({ error: 'Kein Retainer-Projekt' }, { status: 400 });
      projects = [project];
    }

    const ergebnisse = [];
    for (const project of projects) {
      const { beginn, stunden, hinweis, update } = await altstandNeuBerechnen(db, project);
      if (update) {
        await db.Project.update(project.id, update);
      }
      ergebnisse.push({
        project_id: project.id,
        title: project.title,
        beginn,
        stunden: update ? stunden : 0,
        hinweis: hinweis || null,
      });
    }

    return Response.json({ ergebnisse });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
