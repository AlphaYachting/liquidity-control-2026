import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';

async function sevdeskGet(path, apiKey) {
  const res = await fetch(`${SEVDESK_BASE}${path}`, {
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`sevDesk API error ${res.status}: ${await res.text()}`);
  return res.json();
}

function mapInvoiceStatus(invoice) {
  const status = invoice.status;
  if (status === '1000') return 'paid';
  if (status === '50') return 'cancelled';
  return 'open';
}

function parseAmount(val) {
  return parseFloat(val || '0') || 0;
}

/**
 * Try to find the best matching ConfirmedOrder for an invoice.
 * Strategy:
 * 1. sevDesk invoices often reference the order header in `header` or `address` field
 * 2. Match by customer name (exact) + similar amount (±10%)
 * 3. Match by customer name only (lowest confidence)
 */
function findMatchingOrder(invoice, confirmedOrders) {
  const invCustomer = (invoice.contact?.name || invoice.contactName || '').toLowerCase().trim();
  const invNet = parseAmount(invoice.sumNet);
  const invHeader = (invoice.header || invoice.address || '').toLowerCase();

  let best = null;
  let bestScore = 0;

  for (const order of confirmedOrders) {
    const orderCustomer = (order.customer || '').toLowerCase().trim();
    const orderNet = Number(order.total_net_amount) || 0;
    const orderNum = (order.order_number || '').toLowerCase();
    const orderName = (order.project_name || '').toLowerCase();

    let score = 0;

    if (!invCustomer || !orderCustomer) continue;
    if (invCustomer !== orderCustomer) continue; // must match customer

    score += 10; // customer matches

    // order number in header
    if (orderNum && invHeader.includes(orderNum)) score += 50;
    // project name in header
    if (orderName && orderName.length > 5 && invHeader.includes(orderName.substring(0, 8))) score += 20;
    // amount match ±10%
    if (orderNet > 0 && Math.abs(invNet - orderNet) / orderNet < 0.10) score += 30;
    // amount match ±5%
    if (orderNet > 0 && Math.abs(invNet - orderNet) / orderNet < 0.05) score += 10;

    if (score > bestScore) {
      bestScore = score;
      best = order;
    }
  }

  // Only auto-match if score is high enough (customer + at least one other signal)
  return bestScore >= 20 ? { order: best, confidence: bestScore } : null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ error: 'SEVDESK_API_KEY not set' }, { status: 500 });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const limit = body.limit || 500;
    const year = body.year || null;

    // Fetch invoices from sevDesk
    const data = await sevdeskGet(
      `/Invoice?limit=${limit}&offset=0&embed=contact&orderBy=invoiceDate&orderDirection=desc`,
      apiKey
    );

    let invoices = data.objects || [];

    // Filter by year if provided
    if (year) {
      invoices = invoices.filter(inv => {
        const d = inv.invoiceDate || '';
        return d.startsWith(String(year));
      });
    }

    // Load all ConfirmedOrders for matching
    const allOrders = await base44.asServiceRole.entities.ConfirmedOrder.list();

    let created = 0;
    let updated = 0;
    let failed = 0;
    let matched = 0;

    for (const inv of invoices) {
      try {
        const sevdeskId = String(inv.id);
        const existing = await base44.asServiceRole.entities.InvoiceRecord.filter({ sevdesk_id: sevdeskId });

        const invoiceDate = inv.invoiceDate ? inv.invoiceDate.substring(0, 10) : null;
        const dueDate = inv.payDate ? inv.payDate.substring(0, 10) : null;
        const paymentDate = inv.entryDate ? inv.entryDate.substring(0, 10) : null;

        const netAmount = parseAmount(inv.sumNet);
        const grossAmount = parseAmount(inv.sumGross);
        const vatAmount = parseAmount(inv.sumTax);
        const paidAmount = parseAmount(inv.sumGrossPay || '0');

        const invoiceType = inv.invoiceType === 'AN' ? 'advance_invoice' :
                            inv.invoiceType === 'RE' ? 'partial_invoice' : 'final_invoice';

        const paymentStatus = mapInvoiceStatus(inv);

        // Try to match to a ConfirmedOrder
        const matchResult = findMatchingOrder(inv, allOrders);
        const confirmedOrderId = matchResult?.order?.id || (existing[0]?.confirmed_order_id) || null;
        const matchStatus = matchResult ? 'auto_matched' : (existing[0]?.match_status || 'unmatched');
        const matchConfidence = matchResult?.confidence || (existing[0]?.match_confidence) || 0;

        if (matchResult) matched++;

        const record = {
          invoice_number: inv.invoiceNumber || '',
          invoice_date: invoiceDate,
          customer_name: inv.contact?.name || inv.contactName || '',
          invoice_type: invoiceType,
          net_amount: netAmount,
          gross_amount: grossAmount,
          vat_amount: vatAmount,
          vat_rate: netAmount > 0 ? Math.round((vatAmount / netAmount) * 100) : 20,
          due_date: dueDate,
          payment_status: paymentStatus,
          paid_amount: paidAmount,
          open_amount: grossAmount - paidAmount,
          payment_date: paymentStatus === 'paid' ? paymentDate : null,
          source_type: 'sevdesk',
          sevdesk_id: sevdeskId,
          confirmed_order_id: confirmedOrderId,
          match_status: matchStatus,
          match_confidence: matchConfidence,
          notes: inv.header || '',
        };

        if (existing && existing.length > 0) {
          await base44.asServiceRole.entities.InvoiceRecord.update(existing[0].id, record);
          updated++;
        } else {
          await base44.asServiceRole.entities.InvoiceRecord.create(record);
          created++;
        }
      } catch {
        failed++;
      }
    }

    return Response.json({
      success: true,
      fetched: invoices.length,
      created,
      updated,
      failed,
      matched,
      message: `sevDesk Rechnungen synchronisiert: ${created} neu, ${updated} aktualisiert, ${matched} Aufträgen zugeordnet, ${failed} Fehler`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});