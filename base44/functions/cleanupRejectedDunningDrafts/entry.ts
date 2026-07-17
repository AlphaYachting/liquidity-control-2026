import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Einmaliger Abgleich: löscht sevDesk-Entwürfe von bereits abgelehnten Mahnungen,
// die vor Einführung der automatischen Löschung abgelehnt wurden.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ error: 'SEVDESK_API_KEY not set' }, { status: 500 });

    const rejected = await base44.asServiceRole.entities.DunningRecord.filter({ status: 'rejected' });
    const pending = rejected.filter(r => r.sevdesk_reminder_id && !(r.notes || '').includes('gelöscht'));

    let deleted = 0;
    let failed = 0;
    const errors = [];

    for (const r of pending) {
      const res = await fetch(`${SEVDESK_BASE}/Invoice/${r.sevdesk_reminder_id}`, {
        method: 'DELETE',
        headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' }
      });
      if (res.ok || res.status === 404) {
        // 404 = bereits gelöscht → ebenfalls als bereinigt markieren
        await base44.asServiceRole.entities.DunningRecord.update(r.id, {
          notes: 'Entwurf in sevDesk gelöscht (Abgleich).',
        });
        deleted++;
      } else {
        failed++;
        errors.push(`${r.invoice_number}: ${res.status} ${(await res.text()).slice(0, 150)}`);
      }
      await sleep(500);
    }

    return Response.json({
      success: true,
      checked: pending.length,
      deleted,
      failed,
      errors: errors.slice(0, 10),
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});