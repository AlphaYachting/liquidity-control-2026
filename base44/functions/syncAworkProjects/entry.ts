import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = Deno.env.get('AWORK_API_KEY');
  const apiBase = Deno.env.get('AWORK_API_BASE_URL') || 'https://api.awork.com';

  if (!apiKey) {
    // Update setting status
    const settings = await base44.asServiceRole.entities.AworkIntegrationSetting.list();
    if (settings.length > 0) {
      await base44.asServiceRole.entities.AworkIntegrationSetting.update(settings[0].id, {
        connection_status: 'not_configured'
      });
    }
    return Response.json({ error: 'AWORK_API_KEY not configured' }, { status: 400 });
  }

  const logEntry = await base44.asServiceRole.entities.AworkSyncLog.create({
    sync_type: 'projects',
    started_at: new Date().toISOString(),
    status: 'running',
    triggered_by: 'manual'
  });

  let allProjects = [];
  let page = 1;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    const resp = await fetch(`${apiBase}/api/v1/projects?page=${page}&pageSize=${limit}`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });

    if (resp.status === 429) {
      await base44.asServiceRole.entities.AworkSyncLog.update(logEntry.id, {
        status: 'failed', finished_at: new Date().toISOString(),
        errors: 'Rate limited by awork API'
      });
      const settings = await base44.asServiceRole.entities.AworkIntegrationSetting.list();
      if (settings.length > 0) {
        await base44.asServiceRole.entities.AworkIntegrationSetting.update(settings[0].id, {
          connection_status: 'rate_limited'
        });
      }
      return Response.json({ error: 'Rate limited' }, { status: 429 });
    }

    if (!resp.ok) {
      const errText = await resp.text();
      await base44.asServiceRole.entities.AworkSyncLog.update(logEntry.id, {
        status: 'failed', finished_at: new Date().toISOString(),
        errors: `HTTP ${resp.status}: ${errText.slice(0, 500)}`
      });
      const settings = await base44.asServiceRole.entities.AworkIntegrationSetting.list();
      if (settings.length > 0) {
        await base44.asServiceRole.entities.AworkIntegrationSetting.update(settings[0].id, {
          connection_status: 'error'
        });
      }
      return Response.json({ error: `awork API error: ${resp.status}` }, { status: 502 });
    }

    const data = await resp.json();
    const batch = Array.isArray(data) ? data : (data.data || []);
    allProjects = allProjects.concat(batch);

    if (batch.length < limit) {
      hasMore = false;
    } else {
      page++;
    }
  }

  // Upsert snapshots
  const existingSnapshots = await base44.asServiceRole.entities.AworkProjectSnapshot.list();
  const snapshotMap = {};
  for (const s of existingSnapshots) {
    snapshotMap[s.awork_project_id] = s;
  }

  let created = 0, updated = 0, failed = 0;
  const now = new Date().toISOString();

  for (const proj of allProjects) {
    const members = proj.members || [];
    const responsible = members.find(m => m.isProjectLead) || members[0];
    const snapshot = {
      awork_project_id: proj.id,
      project_key: proj.projectKey || proj.key || '',
      name: proj.name || '',
      description: proj.description || '',
      company_id: proj.company?.id || '',
      company_name: proj.company?.name || proj.teamId || '',
      project_status: proj.projectStatus?.name || proj.status || '',
      project_type: proj.projectType?.name || '',
      start_date: proj.startDate ? proj.startDate.split('T')[0] : null,
      due_date: proj.dueDate ? proj.dueDate.split('T')[0] : null,
      time_budget_minutes: proj.timeBudget || 0,
      tracked_duration_minutes: proj.trackedDuration || 0,
      tasks_count: proj.tasksCount || 0,
      tasks_done_count: proj.tasksDoneCount || 0,
      progress_percent: proj.tasksCount > 0
        ? Math.round(((proj.tasksDoneCount || 0) / proj.tasksCount) * 100) : 0,
      responsible_user_name: responsible?.name || '',
      responsible_user_email: responsible?.email || '',
      members_json: JSON.stringify(members.map(m => ({ id: m.userId, name: m.name, email: m.email }))),
      custom_fields_json: JSON.stringify(proj.entityCustomFields || []),
      raw_payload: JSON.stringify(proj).slice(0, 4000),
      last_synced_at: now,
      is_archived: proj.isArchived || false
    };

    try {
      if (snapshotMap[proj.id]) {
        await base44.asServiceRole.entities.AworkProjectSnapshot.update(snapshotMap[proj.id].id, snapshot);
        updated++;
      } else {
        await base44.asServiceRole.entities.AworkProjectSnapshot.create(snapshot);
        created++;
      }
    } catch {
      failed++;
    }
  }

  // Update integration setting
  const settings = await base44.asServiceRole.entities.AworkIntegrationSetting.list();
  if (settings.length > 0) {
    await base44.asServiceRole.entities.AworkIntegrationSetting.update(settings[0].id, {
      connection_status: 'connected',
      last_successful_sync: now,
      total_projects_synced: allProjects.length
    });
  } else {
    await base44.asServiceRole.entities.AworkIntegrationSetting.create({
      api_base_url: apiBase,
      connection_status: 'connected',
      last_successful_sync: now,
      total_projects_synced: allProjects.length,
      read_only_mode: true
    });
  }

  await base44.asServiceRole.entities.AworkSyncLog.update(logEntry.id, {
    status: failed > 0 && created + updated === 0 ? 'failed' : failed > 0 ? 'partial' : 'success',
    finished_at: now,
    records_fetched: allProjects.length,
    records_created: created,
    records_updated: updated,
    records_failed: failed
  });

  return Response.json({
    success: true,
    projects_fetched: allProjects.length,
    created,
    updated,
    failed
  });
});