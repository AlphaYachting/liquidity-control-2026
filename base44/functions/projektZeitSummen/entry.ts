import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Drei Summen je Projekt — statt tausend Buchungen im Browser.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const projectId = body.project_id;
    if (!projectId) return Response.json({ error: 'project_id fehlt' }, { status: 400 });

    const sprints = await base44.asServiceRole.entities.Sprint.filter({ project_id: projectId }, 'delivery_date', 100);
    const laufend = sprints
      .filter((s) => s.status === 'laufend')
      .sort((a, b) => (a.delivery_date || '9999-12-31').localeCompare(b.delivery_date || '9999-12-31'))[0] || null;

    const now = new Date();
    const monatPraefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let gesamt = 0;
    let sprintSumme = 0;
    let monat = 0;
    let skip = 0;
    const limit = 500;
    while (true) {
      const page = await base44.asServiceRole.entities.TimeEntry.filter(
        { project_id: projectId }, '-entry_date', limit, skip
      );
      for (const e of page) {
        const h = Number(e.hours) || (Number(e.duration_minutes) || 0) / 60;
        gesamt += h;
        if (laufend && e.sprint_id === laufend.id) sprintSumme += h;
        if ((e.entry_date || '').startsWith(monatPraefix)) monat += h;
      }
      if (page.length < limit) break;
      skip += limit;
    }

    const r2 = (v) => Math.round(v * 100) / 100;
    return Response.json({
      sprint_id: laufend?.id || null,
      sprint_titel: laufend?.title || null,
      sprint_target_hours: laufend?.target_hours || 0,
      gebucht_sprint: r2(sprintSumme),
      gebucht_monat: r2(monat),
      gebucht_gesamt: r2(gesamt),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}