import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const batchSize = body.batch_size || 30;

    let offset = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    let totalFetched = 0;
    let batchCount = 0;

    while (true) {
      const res = await base44.functions.invoke('syncSevdeskOrders', { batch_size: batchSize, offset });
      const data = res.data;

      totalCreated += data.created || 0;
      totalUpdated += data.updated || 0;
      totalFailed += data.failed || 0;
      totalFetched += data.fetched || 0;
      batchCount++;

      console.log(`Batch ${batchCount} (offset ${offset}): ${data.created} neu, ${data.updated} aktualisiert, ${data.failed} Fehler`);

      if (!data.has_more) break;

      offset = data.next_offset;
      await sleep(500); // Pause zwischen Batches
    }

    return Response.json({
      success: true,
      batches: batchCount,
      fetched: totalFetched,
      created: totalCreated,
      updated: totalUpdated,
      failed: totalFailed,
      message: `sevDesk Aufträge vollständig synchronisiert: ${totalCreated} neu, ${totalUpdated} aktualisiert, ${totalFailed} Fehler in ${batchCount} Batches`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});