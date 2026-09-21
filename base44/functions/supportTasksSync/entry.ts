import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Lädt die awork-Aufgaben jener Support-/Wartungsprojekte nach, auf die seit dem
// Stichtag Zeit gebucht wurde. Nur so ist der Erledigt-Status dieser Projekte bekannt.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const since = body?.since || '2026-07-24';
    const maxProjects = Math.min(Number(body?.max_projects) || 6, 12);

    async function alleSeiten(fetcher) {
      const out = [];
      let offset = 0;
      const size = 500;
      while (true) {
        const page = await fetcher(size, offset);
        out.push(...page);
        if (page.length < size) break;
        offset += size;
        if (offset > 20000) break;
      }
      return out;
    }

    const projekte = await alleSeiten((l, o) =>
      base44.asServiceRole.entities.AworkProjectSnapshot.list('-last_synced_at', l, o)
    );
    // Jedes Projekt mit offener Zeit zählt — der Aufgabenstatus „In Verrechnung"
    // entscheidet über die Abrechnung, nicht die Projektart.
    const supportIds = new Set(projekte.map(p => p.awork_project_id));

    const buchungen = await alleSeiten((l, o) =>
      base44.asServiceRole.entities.AworkTimeEntry.filter({ is_billed: false, is_billable: true }, '-entry_date', l, o)
    );
    const relevanteProjekte = [...new Set(
      buchungen
        .filter(b => b.task_id && supportIds.has(b.awork_project_id) && (b.entry_date || '') >= since)
        .map(b => b.awork_project_id)
    )];

    // Projekte ohne (frische) Aufgaben zuerst
    const aufgaben = await alleSeiten((l, o) =>
      base44.asServiceRole.entities.AworkTaskSnapshot.list('-last_synced_at', l, o)
    );
    const letzterSync = {};
    aufgaben.forEach(t => {
      const cur = letzterSync[t.awork_project_id] || '';
      if ((t.last_synced_at || '') > cur) letzterSync[t.awork_project_id] = t.last_synced_at || '';
    });
    const grenze = new Date(Date.now() - 12 * 3600000).toISOString();
    const offen = relevanteProjekte
      .filter(id => (letzterSync[id] || '') < grenze)
      .sort((a, b) => (letzterSync[a] || '').localeCompare(letzterSync[b] || ''));

    const batch = offen.slice(0, maxProjects);
    const ergebnisse = [];
    for (const id of batch) {
      const res = await base44.functions.invoke('syncAworkTasksForProject', { awork_project_id: id });
      ergebnisse.push({ awork_project_id: id, ok: !res?.data?.error, tasks: res?.data?.tasks_fetched ?? null, error: res?.data?.error || null });
    }

    return Response.json({
      success: true,
      support_projects_with_time: relevanteProjekte.length,
      synced: ergebnisse,
      remaining: offen.length - batch.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}