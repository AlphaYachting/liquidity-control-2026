import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { pruefeAnweisungen } from '../../shared/billingReconcile.js';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ error: 'SEVDESK_API_KEY nicht gesetzt' }, { status: 500 });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    // Ohne apply=true wird ausschliesslich geprüft — kein einziger Schreibvorgang.
    const apply = body.apply === true;
    const ids = Array.isArray(body.ids) ? body.ids : [];

    const { faelle, zusammenfassung, angewendet } = await pruefeAnweisungen({ base44, apiKey, apply, ids });

    if (apply && angewendet > 0) {
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'update',
        entity_type: 'BillingInstruction',
        entity_id: 'sevdesk_abgleich',
        user_email: user.email || 'system',
        details: `sevDesk-Abgleich (manuell): ${angewendet} Anweisung(en) angeglichen (${ids.join(', ')})`,
      }).catch(() => {});
    }

    return Response.json({ ok: true, modus: apply ? 'angewendet' : 'nur_pruefung', angewendet, zusammenfassung, faelle });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}