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

  // Standardmäßig nur aktuellen Monat synchronisieren (für Geschwindigkeit)
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  const fromDate = body.from || defaultFrom;
  const toDate = body.to || defaultTo;

  // Nur erste Seite abrufen (max 100 Einträge), um Timeout zu vermeiden
  const pageSize = body.pageSize || 100;
  const page = body.page || 1;

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

  const syncedAt = new Date().toISOString();
  let created = 0, updated = 0, failed = 0;

  // Upserts sequenziell (ohne vorheriges Laden aller existierenden)
  for (const e of entries) {
    const projectName = e.task?.project?.name || e.project?.name || '';
    const projectKey = e.task?.project?.projectKey || e.project?.projectKey || '';
    const isBillableByDefault = e.task?.project?.isBillableByDefault;
    const entryDate = (e.startDateLocal || '').split('T')[0];
    const entryMonth = entryDate ? entryDate.substring(0, 7) : '';

    const record = {
      awork_entry_id: e.id,
      awork_project_id: e.projectId || '',
      project_name: projectName,
      project_key: projectKey,
      is_billable_by_default: isBillableByDefault !== undefined ? isBillableByDefault : true,
      user_id: e.userId || '',
      user_name: e.user ? `${e.user.firstName || ''} ${e.user.lastName || ''}`.trim() : '',
      type_of_work_id: e.typeOfWorkId || '',
      type_of_work_name: e.typeOfWork?.name || '',
      task_id: e.taskId || '',
      task_name: e.task?.name || '',
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
      if (existing && existing.length > 0) {
        await base44.asServiceRole.entities.AworkTimeEntry.update(existing[0].id, record);
        updated++;
      } else {
        await base44.asServiceRole.entities.AworkTimeEntry.create(record);
        created++;
      }
    } catch (err) {
      console.error('Failed entry', e.id, err.message);
      failed++;
    }
    await sleep(50);
  }

  return Response.json({
    success: true,
    period: { from: fromDate, to: toDate },
    entries_fetched: entries.length,
    has_more: entries.length === pageSize,
    next_page: entries.length === pageSize ? page + 1 : null,
    created,
    updated,
    failed
  });
});