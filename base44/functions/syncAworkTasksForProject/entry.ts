import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { awork_project_id } = await req.json();
  if (!awork_project_id) {
    return Response.json({ error: 'awork_project_id is required' }, { status: 400 });
  }

  const apiKey = Deno.env.get('AWORK_API_KEY');
  const apiBase = Deno.env.get('AWORK_API_BASE_URL') || 'https://api.awork.com';

  if (!apiKey) {
    return Response.json({ error: 'AWORK_API_KEY not configured' }, { status: 400 });
  }

  const logEntry = await base44.asServiceRole.entities.AworkSyncLog.create({
    sync_type: 'project_tasks',
    started_at: new Date().toISOString(),
    status: 'running',
    triggered_by: 'manual',
    notes: `Project: ${awork_project_id}`
  });

  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

  // Fetch task lists / sections first
  let taskListMap = {};
  const tlResp = await fetch(`${apiBase}/api/v1/projects/${awork_project_id}/taskviews`, { headers });
  if (tlResp.ok) {
    const tlData = await tlResp.json();
    const lists = Array.isArray(tlData) ? tlData : (tlData.data || []);
    for (const tl of lists) {
      taskListMap[tl.id] = tl.name || tl.title || '';
    }
  }

  // Fetch all tasks for project (paginated)
  let allTasks = [];
  let page = 1;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    const resp = await fetch(
      `${apiBase}/api/v1/projects/${awork_project_id}/tasks?page=${page}&pageSize=${limit}`,
      { headers }
    );

    if (resp.status === 429) {
      await base44.asServiceRole.entities.AworkSyncLog.update(logEntry.id, {
        status: 'failed', finished_at: new Date().toISOString(), errors: 'Rate limited'
      });
      return Response.json({ error: 'Rate limited' }, { status: 429 });
    }

    if (!resp.ok) {
      const errText = await resp.text();
      await base44.asServiceRole.entities.AworkSyncLog.update(logEntry.id, {
        status: 'failed', finished_at: new Date().toISOString(),
        errors: `HTTP ${resp.status}: ${errText.slice(0, 500)}`
      });
      return Response.json({ error: `awork API error: ${resp.status}` }, { status: 502 });
    }

    const data = await resp.json();
    const batch = Array.isArray(data) ? data : (data.data || []);
    allTasks = allTasks.concat(batch);

    if (batch.length < limit) hasMore = false;
    else page++;
  }

  // Load existing snapshots for this project
  const existing = await base44.asServiceRole.entities.AworkTaskSnapshot.filter({
    awork_project_id
  });
  const existingMap = {};
  for (const s of existing) existingMap[s.awork_task_id] = s;

  let created = 0, updated = 0, failed = 0;
  const now = new Date().toISOString();

  for (const task of allTasks) {
    const statusType = resolveStatusType(task.taskStatus);
    const assignees = task.assignees || task.users || [];
    const primaryAssignee = assignees[0];
    const taskListId = task.taskListId || task.baseTaskListId || '';
    const taskListName = taskListMap[taskListId] || task.taskListName || '';

    const snapshot = {
      awork_task_id: task.id,
      awork_project_id,
      task_title: task.name || '',
      task_status_id: task.taskStatus?.id || '',
      task_status_name: task.taskStatus?.name || '',
      task_status_type: statusType,
      task_list_id: taskListId,
      task_list_name: taskListName,
      assignee_name: primaryAssignee?.name || '',
      assignee_email: primaryAssignee?.email || '',
      due_date: task.dueDate ? task.dueDate.split('T')[0] : null,
      planned_duration_minutes: task.plannedDuration || 0,
      tracked_duration_minutes: task.trackedDuration || task.trackedTime || 0,
      is_done: statusType === 'done' || !!task.closedAt,
      is_blocked: statusType === 'blocked',
      custom_fields_json: JSON.stringify(task.entityCustomFields || task.customFields || []),
      last_activity_at: task.updatedAt || task.closedAt || now,
      raw_payload: JSON.stringify(task).slice(0, 3000),
      last_synced_at: now
    };

    try {
      if (existingMap[task.id]) {
        await base44.asServiceRole.entities.AworkTaskSnapshot.update(existingMap[task.id].id, snapshot);
        updated++;
      } else {
        await base44.asServiceRole.entities.AworkTaskSnapshot.create(snapshot);
        created++;
      }
    } catch {
      failed++;
    }
  }

  await base44.asServiceRole.entities.AworkSyncLog.update(logEntry.id, {
    status: failed > 0 && created + updated === 0 ? 'failed' : failed > 0 ? 'partial' : 'success',
    finished_at: now,
    records_fetched: allTasks.length,
    records_created: created,
    records_updated: updated,
    records_failed: failed
  });

  // Update integration setting task count
  const settings = await base44.asServiceRole.entities.AworkIntegrationSetting.list();
  if (settings.length > 0) {
    await base44.asServiceRole.entities.AworkIntegrationSetting.update(settings[0].id, {
      total_tasks_synced: (settings[0].total_tasks_synced || 0) + allTasks.length,
      last_successful_sync: now
    });
  }

  return Response.json({
    success: true,
    tasks_fetched: allTasks.length,
    task_lists: Object.keys(taskListMap).length,
    created,
    updated,
    failed
  });
});

function resolveStatusType(taskStatus) {
  if (!taskStatus) return 'unknown';
  const type = (taskStatus.type || taskStatus.typeOfWorkTitle || '').toLowerCase();
  const name = (taskStatus.name || '').toLowerCase();
  if (type === 'done' || type === 'closed' || name.includes('erledigt') || name.includes('done') || name.includes('abgeschlossen')) return 'done';
  if (type === 'blocked' || name.includes('blockiert') || name.includes('blocked')) return 'blocked';
  if (type === 'inprogress' || type === 'in-progress' || type === 'progress' || name.includes('progress') || name.includes('bearbeitung')) return 'progress';
  if (type === 'open' || type === 'todo' || name.includes('offen') || name.includes('open') || name.includes('todo')) return 'open';
  return 'open';
}