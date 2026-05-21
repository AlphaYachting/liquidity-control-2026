import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function resolveStatusType(taskStatus) {
  if (!taskStatus) return 'unknown';
  const type = (taskStatus.type || '').toLowerCase();
  const name = (taskStatus.name || '').toLowerCase();
  if (type === 'done' || type === 'closed' || name.includes('erledigt') || name.includes('done') || name.includes('abgeschlossen')) return 'done';
  if (type === 'blocked' || name.includes('blockiert') || name.includes('blocked')) return 'blocked';
  if (type === 'inprogress' || type === 'in-progress' || type === 'progress' || name.includes('progress') || name.includes('bearbeitung')) return 'progress';
  return 'open';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const awork_project_id = body?.awork_project_id;

    if (!awork_project_id) {
      return Response.json({ error: 'awork_project_id is required' }, { status: 400 });
    }

    const apiKey = Deno.env.get('AWORK_API_KEY');
    const apiBase = Deno.env.get('AWORK_API_BASE_URL') || 'https://api.awork.com';

    if (!apiKey) {
      return Response.json({ error: 'AWORK_API_KEY not configured' }, { status: 400 });
    }

    const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

    // Fetch task lists for name lookup
    let taskListMap = {};
    try {
      const tlResp = await fetch(`${apiBase}/api/v1/projects/${awork_project_id}/tasklists`, { headers });
      if (tlResp.ok) {
        const tlData = await tlResp.json();
        const lists = Array.isArray(tlData) ? tlData : (tlData.data || []);
        for (const tl of lists) taskListMap[tl.id] = tl.name || '';
      }
    } catch (e) {
      console.error('Failed to fetch task lists:', e.message);
    }

    // Fetch tasks — use project tasks endpoint directly
    let allTasks = [];

    const tasksResp = await fetch(
      `${apiBase}/api/v1/projects/${awork_project_id}/projecttasks?page=1&pageSize=200`,
      { headers }
    );

    if (!tasksResp.ok || !tasksResp.headers.get('content-type')?.includes('application/json')) {
      const errText = await tasksResp.text();
      console.error('Tasks endpoint failed:', tasksResp.status, errText.slice(0, 200));
      return Response.json({ error: `awork tasks API error: ${tasksResp.status}`, detail: errText.slice(0, 200) }, { status: 502 });
    }

    const data = await tasksResp.json();
    allTasks = Array.isArray(data) ? data : (data.data || []);

    const now = new Date().toISOString();
    let created = 0, updated = 0, failed = 0;

    // Load existing snapshots for this project
    let existingMap = {};
    try {
      const existing = await base44.asServiceRole.entities.AworkTaskSnapshot.filter({ awork_project_id });
      await sleep(200);
      for (const s of existing) existingMap[s.awork_task_id] = s;
    } catch (e) {
      console.error('Failed to load existing snapshots:', e.message);
    }

    // Upsert tasks with delays to avoid rate limits
    for (const task of allTasks) {
      const statusType = resolveStatusType(task.taskStatus);
      const assignees = task.assignees || task.users || [];
      const primaryAssignee = assignees[0];
      const taskListId = task.taskListId || task.baseTaskListId || '';

      const snapshot = {
        awork_task_id: task.id,
        awork_project_id,
        task_title: task.name || '',
        task_status_id: task.taskStatus?.id || '',
        task_status_name: task.taskStatus?.name || '',
        task_status_type: statusType,
        task_list_id: taskListId,
        task_list_name: taskListMap[taskListId] || task.taskListName || '',
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
        await sleep(150);
      } catch (e) {
        console.error('Failed to upsert task', task.id, e.message);
        failed++;
        await sleep(400);
      }
    }

    return Response.json({
      success: true,
      tasks_fetched: allTasks.length,
      task_lists: Object.keys(taskListMap).length,
      created,
      updated,
      failed
    });

  } catch (error) {
    console.error('Unhandled error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});