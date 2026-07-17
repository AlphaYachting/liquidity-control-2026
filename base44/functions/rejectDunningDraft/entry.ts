import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ error: 'SEVDESK_API_KEY not set' }, { status: 500 });

    const { dunning_record_id } = await req.json();
    if (!dunning_record_id) return Response.json({ error: 'dunning_record_id required' }, { status: 400 });

    const records = await base44.asServiceRole.entities.DunningRecord.filter({ id: dunning_record_id });
    const record = records?.[0];
    if (!record) return Response.json({ error: 'DunningRecord not found' }, { status: 404 });
    if (record.status !== 'draft_created') {
      return Response.json({ error: `Nur wartende Entwürfe können abgelehnt werden (Status: ${record.status})` }, { status: 422 });
    }

    // Entwurf in sevDesk löschen (DELETE funktioniert nur für Entwürfe, Status 100)
    let deletedInSevdesk = false;
    let deleteNote = '';
    if (record.sevdesk_reminder_id) {
      const res = await fetch(`${SEVDESK_BASE}/Invoice/${record.sevdesk_reminder_id}`, {
        method: 'DELETE',
        headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        deletedInSevdesk = true;
      } else {
        const text = await res.text();
        // 404/400 = bereits gelöscht oder nicht mehr Entwurf — Ablehnung trotzdem durchführen
        deleteNote = `sevDesk-Löschung fehlgeschlagen (${res.status}): ${text.slice(0, 200)}`;
      }
    }

    await base44.asServiceRole.entities.DunningRecord.update(record.id, {
      status: 'rejected',
      approved_by: user.email || '',
      approved_at: new Date().toISOString(),
      notes: deletedInSevdesk
        ? 'Entwurf in sevDesk gelöscht.'
        : (deleteNote || 'Kein sevDesk-Entwurf vorhanden.'),
    });

    return Response.json({
      success: true,
      deleted_in_sevdesk: deletedInSevdesk,
      note: deleteNote || null,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});