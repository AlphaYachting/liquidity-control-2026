import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';

async function sevdeskGet(path, apiKey) {
  const res = await fetch(`${SEVDESK_BASE}${path}`, {
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`sevDesk API error ${res.status}: ${await res.text()}`);
  return res.json();
}

function parseAmount(val) {
  return parseFloat(val || '0') || 0;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ error: 'SEVDESK_API_KEY not set' }, { status: 500 });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const year = body.year || null; // e.g. 2026
    const limit = body.limit || 500;

    // Fetch only AB (Auftragsbestätigungen) — keine Angebote (AN)
    const abData = await sevdeskGet(`/Order?orderType=AB&limit=${limit}&offset=0&embed=contact&orderBy=orderDate&orderDirection=desc`, apiKey);

    let orders = abData.objects || [];

    // Filter by year if provided
    if (year) {
      orders = orders.filter(o => {
        const d = o.orderDate || o.deliveryDate || '';
        return d.startsWith(String(year));
      });
    }

    // Only "Offen" (500) and "Angenommen" (750)
    orders = orders.filter(o => o.status === '500' || o.status === '750');

    const result = orders.map(ord => ({
      id: String(ord.id),
      order_type: ord.orderType || 'AB',
      order_number: ord.header || ord.orderNumber || `sevDesk-${ord.id}`,
      customer: ord.contact?.name || ord.contactName || '—',
      order_date: ord.orderDate ? ord.orderDate.substring(0, 10) : null,
      total_net: parseAmount(ord.sumNet),
      total_gross: parseAmount(ord.sumGross),
      status: ord.status,
      project_name: ord.deliveryTerms || ord.header || '',
    }));

    return Response.json({ success: true, orders: result, total: result.length });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});