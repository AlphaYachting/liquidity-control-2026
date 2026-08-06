import { fetchLiveOpenReceivables } from '../../shared/sevdeskLiveReceivables.ts';

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

    const all = await fetchLiveOpenReceivables(apiKey);
    const invoices = all.filter((inv) => inv.invoice_date && inv.invoice_date >= CUTOFF_DATE);
    const totalOpen = invoices.reduce((s, i) => s + i.open_amount, 0);

    return Response.json({
      success: true,
      cutoff_date: CUTOFF_DATE,
      generated_at: new Date().toISOString(),
      count: invoices.length,
      total_open_gross: Math.round(totalOpen * 100) / 100,
      invoices,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}