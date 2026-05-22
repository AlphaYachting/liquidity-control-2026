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

function mapOrderStatus(order) {
  const status = order.status;
  if (status === '200') return 'confirmed';
  if (status === '1000') return 'completed';
  if (status === '100') return 'draft';
  if (status === '50') return 'cancelled';
  return 'confirmed';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ error: 'SEVDESK_API_KEY not set' }, { status: 500 });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const limit = body.limit || 100;
    const offset = body.offset || 0;

    // Fetch orders (Auftragsbestätigungen) from sevDesk
    // orderType: AB = Auftragsbestätigung, AN = Angebot
    const [abData, anData] = await Promise.all([
      sevdeskGet(`/Order?orderType=AB&limit=${limit}&offset=${offset}&embed=contact&orderBy=orderDate&orderDirection=desc`, apiKey),
      sevdeskGet(`/Order?orderType=AN&limit=${limit}&offset=${offset}&embed=contact&orderBy=orderDate&orderDirection=desc`, apiKey),
    ]);

    const orders = [...(abData.objects || []), ...(anData.objects || [])];
    let created = 0;
    let updated = 0;
    let failed = 0;

    for (const ord of orders) {
      try {
        const sevdeskId = String(ord.id);
        const orderNumber = ord.header || ord.orderNumber || '';
        
        // Check if already exists by sevdesk order number match or notes
        const existing = await base44.asServiceRole.entities.ConfirmedOrder.filter({ order_number: orderNumber });
        
        const orderDate = ord.orderDate ? ord.orderDate.substring(0, 10) : null;
        const netAmount = parseAmount(ord.sumNet);
        const grossAmount = parseAmount(ord.sumGross);
        const vatRate = netAmount > 0 ? Math.round(((grossAmount - netAmount) / netAmount) * 100) : 20;

        const record = {
          order_number: orderNumber,
          customer: ord.contact?.name || ord.contactName || '',
          project_name: ord.deliveryTerms || ord.header || `sevDesk-${sevdeskId}`,
          confirmation_date: orderDate,
          total_net_amount: netAmount,
          total_gross_amount: grossAmount,
          vat_rate: vatRate,
          payment_terms: ord.paymentTerms || '',
          description: ord.footText || '',
          status: mapOrderStatus(ord),
          source_type: 'sevdesk',
          notes: `sevDesk ID: ${sevdeskId} | Typ: ${ord.orderType || 'AB'}`,
          responsible_project_manager: ord.contact?.surename || '',
        };

        if (existing && existing.length > 0) {
          await base44.asServiceRole.entities.ConfirmedOrder.update(existing[0].id, record);
          updated++;
        } else {
          await base44.asServiceRole.entities.ConfirmedOrder.create(record);
          created++;
        }
      } catch {
        failed++;
      }
    }

    return Response.json({
      success: true,
      fetched: orders.length,
      created,
      updated,
      failed,
      message: `sevDesk Aufträge synchronisiert: ${created} neu, ${updated} aktualisiert, ${failed} Fehler`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});