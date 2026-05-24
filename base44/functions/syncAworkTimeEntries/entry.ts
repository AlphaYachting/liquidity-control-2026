import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = Deno.env.get('AWORK_API_KEY');
  const apiBase = Deno.env.get('AWORK_API_BASE_URL') || 'https://api.awork.com';

  if (!apiKey) return Response.json({ error: 'AWORK_API_KEY not configured' }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  // Default: aktuellen Monat + letzten Monat holen
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  const fromDate = body.from || defaultFrom;
  const toDate = body.to || defaultTo;

  let allEntries = [];
  let page = 1;
  const pageSize = 200;

  // Alle Seiten abrufen
  while (true) {
    const url = `${apiBase}/api/v1/timeentries?page=${page}&pageSize=${pageSize}&startDate=${fromDate}&endDate=${toDate}`;
    const resp = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return Response.json({ error: `awork API error: ${resp.status}`, detail: errText.slice(0, 300) }, { status: 502 });
    }

    const data = await resp.json();
    const entries = Array.isArray(data) ? data : (data.data || []);
    if (entries.length === 0) break;

    allEntries = allEntries.concat(entries);
    if (entries.length < pageSize) break;
    page++;
    await sleep(300);
  }

  const syncedAt = new Date().toISOString();
  let created = 0, updated = 0, failed = 0;

  const BATCH_SIZE = 10;
  for (let i = 0; i < allEntries.length; i += BATCH_SIZE) {
    const batch = allEntries.slice(i, i + BATCH_SIZE);

    for (const e of batch) {
      const projectName = e.task?.project?.name || e.project?.name || '';
      const projectKey = e.task?.project?.projectKey || e.project?.projectKey || '';
      const isBillableByDefault = e.task?.project?.isBillableByDefault;
      const userName = e.user ? `${e.user.firstName || ''} ${e.user.lastName || ''}`.trim() : '';
      const taskName = e.task?.name || '';
      const entryDate = (e.startDateLocal || '').split('T')[0];
      const entryMonth = entryDate ? entryDate.substring(0, 7) : '';

      const record = {
        awork_entry_id: e.id,
        awork_project_id: e.projectId || '',
        project_name: projectName,
        project_key: projectKey,
        is_billable_by_default: isBillableByDefault !== undefined ? isBillableByDefault : true,
        user_id: e.userId || '',
        user_name: userName,
        type_of_work_id: e.typeOfWorkId || '',
        type_of_work_name: e.typeOfWork?.name || '',
        task_id: e.taskId || '',
        task_name: taskName,
        duration_minutes: typeof e.duration === 'number' ? e.duration : 0,
        is_billable: e.isBillable !== false,
        is_billed: e.isBilled === true,
        entry_date: entryDate || null,
        entry_month: entryMonth,
        note: e.note || '',
        last_synced_at: syncedAt
      };

      try {
        const existing = await base44.asServiceRole.entities.AworkTimeEntry.filter({ awork_entry_id: e.id });
        await sleep(100);
        if (existing && existing.length > 0) {
          await base44.asServiceRole.entities.AworkTimeEntry.update(existing[0].id, record);
          updated++;
        } else {
          await base44.asServiceRole.entities.AworkTimeEntry.create(record);
          created++;
        }
        await sleep(100);
      } catch (err) {
        console.error('Failed to upsert entry', e.id, err.message);
        failed++;
        await sleep(300);
      }
    }

    await sleep(200);
  }

  return Response.json({
    success: true,
    period: { from: fromDate, to: toDate },
    entries_fetched: allEntries.length,
    created,
    updated,
    failed
  });
});