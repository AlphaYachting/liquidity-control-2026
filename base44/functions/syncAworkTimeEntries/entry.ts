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

  // Standard für täglichen Sync: nur die letzten 3 Tage (heute + 2 Tage zurück für Korrekturen)
  // Für vollständigen Re-Sync: body.from / body.to übergeben
  const now = new Date();
  const daysBack = body.days_back || 3;
  const defaultFrom = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const defaultTo = now.toISOString().split('T')[0];

  const fromDate = body.from || defaultFrom;
  const toDate = body.to || defaultTo;

  console.log(`Sync Zeitbuchungen: ${fromDate} – ${toDate}`);

  // awork API mit korrektem datetime Filter — max 500 Einträge (5 Seiten) pro Aufruf
  const pageSize = 100;
  const maxPages = 20;
  let allEntries = [];
  let page = 1;

  while (page <= maxPages) {
    const filterParam = encodeURIComponent(`startDateLocal ge datetime'${fromDate}T00:00' and startDateLocal le datetime'${toDate}T23:59'`);
    const url = `${apiBase}/api/v1/timeentries?page=${page}&pageSize=${pageSize}&filterby=${filterParam}`;

    const resp = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return Response.json({ error: `awork API error: ${resp.status} (page ${page})`, detail: errText.slice(0, 300) }, { status: 502 });
    }

    const data = await resp.json();
    const pageEntries = Array.isArray(data) ? data : (data.data || []);
    allEntries = allEntries.concat(pageEntries);
    console.log(`awork time entries page ${page}: ${pageEntries.length} fetched (total: ${allEntries.length})`);

    if (pageEntries.length < pageSize) break;
    page++;
    await sleep(200);
  }

  const syncedAt = new Date().toISOString();

  // Alle existierenden Einträge im Zeitraum auf einmal laden
  const existingEntries = await base44.asServiceRole.entities.AworkTimeEntry.filter(
    { entry_date: { $gte: fromDate, $lte: toDate } }
  ).catch(() => []);

  const existingMap = {};
  for (const e of existingEntries) {
    if (e.awork_entry_id) existingMap[e.awork_entry_id] = e.id;
  }

  // Einträge aufteilen in neue und zu aktualisierende
  // Existierende als Map für schnellen Zugriff
  const existingDataMap = {};
  for (const e of existingEntries) {
    if (e.awork_entry_id) existingDataMap[e.awork_entry_id] = e;
  }

  const toCreate = [];
  const toUpdate = [];

  for (const e of allEntries) {
    const entryDate = (e.startDateLocal || '').split('T')[0];
    const entryMonth = entryDate ? entryDate.substring(0, 7) : '';
    const isBillable = e.isBillable !== false;
    const isBilled = e.isBilled === true;
    // awork API liefert duration in SEKUNDEN — in Minuten umrechnen, damit duration_minutes korrekt ist
    const durationMins = typeof e.duration === 'number' ? Math.round(e.duration / 60) : 0;

    const existing = existingDataMap[e.id];

    // Update nur wenn sich relevante Felder geändert haben
    if (existing) {
      const changed = existing.is_billable !== isBillable ||
                      existing.is_billed !== isBilled ||
                      existing.duration_minutes !== durationMins;
      if (!changed) continue; // Keine Änderung — überspringen
    }

    const record = {
      awork_entry_id: e.id,
      awork_project_id: e.projectId || '',
      project_name: e.task?.project?.name || e.project?.name || '',
      project_key: e.task?.project?.projectKey || e.project?.projectKey || '',
      is_billable_by_default: e.task?.project?.isBillableByDefault !== undefined ? e.task.project.isBillableByDefault : true,
      user_id: e.userId || '',
      user_name: e.user ? `${e.user.firstName || ''} ${e.user.lastName || ''}`.trim() : '',
      type_of_work_id: e.typeOfWorkId || '',
      type_of_work_name: e.typeOfWork?.name || '',
      task_id: e.taskId || '',
      task_name: e.task?.name || '',
      duration_minutes: durationMins,
      is_billable: isBillable,
      is_billed: isBilled,
      entry_date: entryDate || null,
      entry_month: entryMonth,
      note: e.note || '',
      last_synced_at: syncedAt
    };

    if (existing) {
      toUpdate.push({ id: existing.id, data: record });
    } else {
      toCreate.push(record);
    }
  }

  let created = 0, updated = 0, failed = 0;

  // Sync-Log anlegen
  let syncLog = null;
  try {
    syncLog = await base44.asServiceRole.entities.AworkSyncLog.create({
      sync_type: 'time_entries',
      started_at: syncedAt,
      status: 'running',
      triggered_by: body.triggered_by || 'manual',
      notes: `Zeitbuchungen: ${fromDate} – ${toDate}`
    });
  } catch (_) { /* Log-Fehler darf Sync nicht blockieren */ }

  // Neue Einträge in Batches von 20 erstellen
  const BATCH_SIZE = 20;
  for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
    const batch = toCreate.slice(i, i + BATCH_SIZE);
    try {
      await base44.asServiceRole.entities.AworkTimeEntry.bulkCreate(batch);
      created += batch.length;
    } catch (err) {
      console.error(`bulkCreate batch ${i}-${i + BATCH_SIZE} failed:`, err.message);
      failed += batch.length;
    }
    if (i + BATCH_SIZE < toCreate.length) await sleep(400);
  }

  // Updates sequenziell in kleinen Batches um Rate Limits zu vermeiden
  const UPDATE_BATCH = 5;
  for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH) {
    const batch = toUpdate.slice(i, i + UPDATE_BATCH);
    for (const { id, data } of batch) {
      try {
        await base44.asServiceRole.entities.AworkTimeEntry.update(id, data);
        updated++;
      } catch (_) {
        failed++;
      }
    }
    if (i + UPDATE_BATCH < toUpdate.length) await sleep(800);
  }

  // Sync-Log abschließen
  if (syncLog?.id) {
    const finishedAt = new Date().toISOString();
    await base44.asServiceRole.entities.AworkSyncLog.update(syncLog.id, {
      finished_at: finishedAt,
      status: failed > 0 && created === 0 && updated === 0 ? 'failed' : failed > 0 ? 'partial' : 'success',
      records_fetched: allEntries.length,
      records_created: created,
      records_updated: updated,
      records_failed: failed,
      notes: `Zeitbuchungen: ${fromDate} – ${toDate}`
    }).catch(() => {});
  }

  return Response.json({
    success: true,
    period: { from: fromDate, to: toDate },
    pages_fetched: page,
    entries_fetched: allEntries.length,
    created,
    updated,
    failed
  });
});