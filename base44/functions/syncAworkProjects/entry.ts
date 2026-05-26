import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Projektstatus-Namen die als "nicht aktiv" gelten
const INACTIVE_STATUS_KEYWORDS = [
  'done', 'archived', 'abgeschlossen', 'completed', 'cancelled', 'abgebrochen',
  'geblockt', 'blocked', 'stuck', 'closed', 'fertig', 'beendet', 'inaktiv'
];

function isActiveProject(proj) {
  if (proj.isArchived === true) return false;
  const status = (proj.projectStatus?.name || '').toLowerCase();
  return !INACTIVE_STATUS_KEYWORDS.some(kw => status.includes(kw));
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = Deno.env.get('AWORK_API_KEY');
  const apiBase = Deno.env.get('AWORK_API_BASE_URL') || 'https://api.awork.com';

  if (!apiKey) {
    return Response.json({ error: 'AWORK_API_KEY not configured' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  // cleanup=true: Archiviert alte Snapshots (einmaliger Bereinigungslauf, separat aufrufen)
  const doCleanup = body.cleanup === true;

  // Alle Projekte von awork laden
  let allProjects = [];
  let page = 1;
  const pageSize = 100;
  while (true) {
    const resp = await fetch(`${apiBase}/api/v1/projects?page=${page}&pageSize=${pageSize}`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return Response.json({ error: `awork API error: ${resp.status} (page ${page})`, detail: errText.slice(0, 500) }, { status: 502 });
    }
    const data = await resp.json();
    const pageProjects = Array.isArray(data) ? data : (data.data || []);
    allProjects = allProjects.concat(pageProjects);
    console.log(`awork page ${page}: ${pageProjects.length} (total: ${allProjects.length})`);
    if (pageProjects.length < pageSize) break;
    page++;
    await sleep(300);
  }

  const activeProjects = allProjects.filter(isActiveProject);
  const inactiveIds = new Set(allProjects.filter(p => !isActiveProject(p)).map(p => p.id));
  console.log(`Active: ${activeProjects.length}, Inactive: ${inactiveIds.size}`);

  // Bestehende Snapshots laden für diff
  const existingSnapshots = await base44.asServiceRole.entities.AworkProjectSnapshot.list();
  await sleep(300);
  const existingMap = {};
  for (const snap of existingSnapshots) {
    existingMap[snap.awork_project_id] = snap;
  }

  const now = new Date().toISOString();
  let created = 0, updated = 0, archived = 0, failed = 0;

  // --- OPTIONAL: Cleanup-Modus: Inaktive Snapshots archivieren (max 50 pro Lauf) ---
  if (doCleanup) {
    let cleanupCount = 0;
    for (const snap of existingSnapshots) {
      if (cleanupCount >= 50) break;
      if (inactiveIds.has(snap.awork_project_id) && !snap.is_archived) {
        try {
          await base44.asServiceRole.entities.AworkProjectSnapshot.update(snap.id, { is_archived: true, last_synced_at: now });
          archived++;
          cleanupCount++;
          await sleep(300);
        } catch (e) {
          console.error('Cleanup failed for', snap.awork_project_id, e.message);
          await sleep(500);
        }
      }
    }
    console.log(`Cleanup: ${archived} snapshots archived`);
    return Response.json({ success: true, cleanup: true, archived });
  }

  // --- Normaler Sync: Nur aktive Projekte upserten ---
  for (let i = 0; i < activeProjects.length; i++) {
    const proj = activeProjects[i];
    const members = proj.members || [];
    const responsible = members.find(m => m.isProjectLead) || members[0];

    const snapshot = {
      awork_project_id: proj.id,
      project_key: proj.projectKey || proj.key || '',
      name: proj.name || '',
      description: proj.description || '',
      company_id: proj.company?.id || '',
      company_name: proj.company?.name || '',
      project_status: proj.projectStatus?.name || '',
      project_type: proj.projectType?.name || '',
      start_date: proj.startDate ? proj.startDate.split('T')[0] : null,
      due_date: proj.dueDate ? proj.dueDate.split('T')[0] : null,
      time_budget_minutes: proj.timeBudget ? Math.round(proj.timeBudget / 60) : 0,
      tracked_duration_minutes: proj.trackedDuration ? Math.round(proj.trackedDuration / 60) : 0,
      tasks_count: proj.tasksCount || 0,
      tasks_done_count: proj.tasksDoneCount || 0,
      progress_percent: proj.tasksCount > 0
        ? Math.round(((proj.tasksDoneCount || 0) / proj.tasksCount) * 100) : 0,
      responsible_user_name: responsible?.name || '',
      responsible_user_email: responsible?.email || '',
      members_json: JSON.stringify(members.map(m => ({ id: m.userId, name: m.name, email: m.email }))),
      custom_fields_json: JSON.stringify(proj.entityCustomFields || []),
      raw_payload: JSON.stringify({
        id: proj.id,
        trackedDuration: proj.trackedDuration,
        timeBudget: proj.timeBudget,
        plannedDuration: proj.plannedDuration,
        projectStatus: proj.projectStatus,
        projectKey: proj.projectKey,
        tasksCount: proj.tasksCount,
        tasksDoneCount: proj.tasksDoneCount,
        isArchived: proj.isArchived,
      }),
      last_synced_at: now,
      is_archived: false
    };

    try {
      const existing = existingMap[proj.id];
      if (existing) {
        await base44.asServiceRole.entities.AworkProjectSnapshot.update(existing.id, snapshot);
        updated++;
      } else {
        await base44.asServiceRole.entities.AworkProjectSnapshot.create(snapshot);
        created++;
      }
      await sleep(350);
    } catch (e) {
      console.error('Failed to upsert project', proj.id, e.message);
      failed++;
      await sleep(700);
    }

    if ((i + 1) % 10 === 0) {
      console.log(`Progress: ${i + 1}/${activeProjects.length}`);
      await sleep(500);
    }
  }

  // Integration Setting aktualisieren
  try {
    const settings = await base44.asServiceRole.entities.AworkIntegrationSetting.list();
    await sleep(200);
    const settingData = {
      connection_status: 'connected',
      last_successful_sync: now,
      total_projects_synced: created + updated,
      notes: `Nur aktive Projekte: ${activeProjects.length} von ${allProjects.length} gesamt.`
    };
    if (settings.length > 0) {
      await base44.asServiceRole.entities.AworkIntegrationSetting.update(settings[0].id, settingData);
    } else {
      await base44.asServiceRole.entities.AworkIntegrationSetting.create({
        ...settingData, api_base_url: apiBase, read_only_mode: true
      });
    }
  } catch (e) {
    console.error('Failed to update integration setting', e.message);
  }

  return Response.json({
    success: true,
    projects_fetched: allProjects.length,
    active_projects: activeProjects.length,
    inactive_projects: inactiveIds.size,
    created,
    updated,
    failed
  });
});