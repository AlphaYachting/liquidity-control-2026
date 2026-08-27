import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { fetchLiveReceivablesWithPaid } from '../../shared/sevdeskLiveReceivables.ts';

// Öffentlicher Bericht für den Masseverwalter — KEIN Login, Zugriff nur über
// den unerratbaren Schlüssel im Link. Nur Rechnungen ab dem Stichtag 24.07.
const ACCESS_KEY = 'mv-9k3xq7t2rf84';
const CUTOFF_DATE = '2026-07-24';

export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.key !== ACCESS_KEY) {
      return Response.json({ error: 'Ungültiger Zugriffsschlüssel' }, { status: 403 });
    }

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ error: 'SEVDESK_API_KEY not set' }, { status: 500 });

    const all = await fetchLiveReceivablesWithPaid(apiKey);
    const filtered = all.filter((inv) => inv.invoice_date && inv.invoice_date >= CUTOFF_DATE);

    // Mahnstand je Rechnung — höchste erreichte Stufe, verworfene/fehlerhafte Vorgänge zählen nicht
    const base44 = createClientFromRequest(req);
    const dunnings = await base44.asServiceRole.entities.DunningRecord.list('-created_date', 1000);
    const byInvoice: Record<string, { level: number; label: string; date: string }> = {};
    for (const d of dunnings) {
      if (d.status === 'rejected' || d.status === 'error') continue;
      const key = String(d.sevdesk_invoice_id || '');
      if (!key) continue;
      const level = Number(d.dunning_level) || 0;
      if (!byInvoice[key] || level > byInvoice[key].level) {
        byInvoice[key] = { level, label: d.level_label || '', date: (d.created_date || '').substring(0, 10) };
      }
    }

    const invoices = filtered.map((inv) => {
      const d = byInvoice[String(inv.id)];
      return {
        ...inv,
        dunning_level: d?.level || 0,
        dunning_label: d?.label || '',
        dunning_date: d?.date || null,
      };
    });
    const totalOpen = invoices.reduce((s, i) => s + i.open_amount, 0);
    const totalPaid = invoices.reduce((s, i) => s + i.paid_amount, 0);

    return Response.json({
      success: true,
      cutoff_date: CUTOFF_DATE,
      generated_at: new Date().toISOString(),
      count: invoices.length,
      total_open_gross: Math.round(totalOpen * 100) / 100,
      total_paid_gross: Math.round(totalPaid * 100) / 100,
      invoices,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}