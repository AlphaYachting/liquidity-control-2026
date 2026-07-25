import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Hält die Awork-Task-Daten aller aktiven Cockpit-Projekte aktuell:
// synchronisiert pro Lauf die 2 am längsten nicht synchronisierten Projekte
// (älter als 20h) — stündlich ausgeführt sind so alle Projekte täglich frisch.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const MAX_PROJECTS_PER_RUN = 2;
    const MIN_AGE_HOURS = 20;

    const projects = await base44.asServiceRole.entities.LiquidityProject.filter({
      is_active_for_billing: true,
      status: 'active',
    });

    const cutoff = Date.now() - MIN_AGE_HOURS * 3600000;
    const stale = projects
      .filter((p) => p.awork_project_id && !p.excluded_from_project_cockpit)
      .filter((p) => !p.awork_last_synced_at || new Date(p.awork_last_synced_at).getTime() < cutoff)
      .sort((a, b) => (a.awork_last_synced_at || '').localeCompare(b.awork_last_synced_at || ''));

    const batch = stale.slice(0, MAX_PROJECTS_PER_RUN);
    const results = [];

    for (const p of batch) {
      try {
        const res = await base44.functions.invoke('syncAworkTasksForProject', {
          awork_project_id: p.awork_project_id,
        });
        const ok = !res?.data?.error;
        if (ok) {
          await base44.asServiceRole.entities.LiquidityProject.update(p.id, {
            awork_last_synced_at: new Date().toISOString(),
          });
        }
        results.push({ project: p.project_name, customer: p.customer, ok, tasks: res?.data?.tasks_fetched ?? null });
      } catch (e) {
        results.push({ project: p.project_name, customer: p.customer, ok: false, error: e.message });
      }
    }

    return Response.json({ success: true, stale_remaining: stale.length - batch.length, synced: results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});