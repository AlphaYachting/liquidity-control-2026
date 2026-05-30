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
  if (status === '100') return 'draft';
  return 'open'; // 200 = versendet, 300 = teilbezahlt
}

function parseAmount(val) {
  return parseFloat(val || '0') || 0;
}

function extractSevdeskIdFromNotes(notes) {
  const match = (notes || '').match(/sevDesk ID:\s*(\d+)/i);
  return match ? match[1] : null;
}

function findMatchingOrder(invoice, confirmedOrders, ordersBySevdeskId) {
  const originId = invoice.origin?.id;
  if (originId && invoice.origin?.objectName === 'Order') {
    const exactMatch = ordersBySevdeskId[originId];
    if (exactMatch) return { order: exactMatch, confidence: 100, method: 'sevdesk_origin' };
  }

  const invCustomer = (invoice.contact?.name || invoice.contactName || '').toLowerCase().trim();
  const invNet = parseAmount(invoice.sumNet);
  const invHeader = (invoice.header || '').toLowerCase();

  let best = null;
  let bestScore = 0;

  for (const order of confirmedOrders) {
    const orderCustomer = (order.customer || '').toLowerCase().trim();
    const orderNet = Number(order.total_net_amount) || 0;
    const orderName = (order.project_name || '').toLowerCase();

    if (!invCustomer || !orderCustomer || invCustomer !== orderCustomer) continue;

    let score = 10;
    if (orderName && orderName.length > 5 && invHeader.includes(orderName.substring(0, 8))) score += 20;
    if (orderNet > 0 && Math.abs(invNet - orderNet) / orderNet < 0.10) score += 30;
    if (orderNet > 0 && Math.abs(invNet - orderNet) / orderNet < 0.03) score += 20;

    if (score > bestScore) { bestScore = score; best = order; }
  }

  return bestScore >= 40 ? { order: best, confidence: bestScore, method: 'fuzzy' } : null;
}

function buildRecord(inv, matchResult, existing) {
  const invoiceDate = inv.invoiceDate ? inv.invoiceDate.substring(0, 10) : null;

  let dueDate = null;
  if (invoiceDate) {
    const timeToPay = parseInt(inv.timeToPay || inv.discountTime || '30', 10);
    const days = isNaN(timeToPay) || timeToPay <= 0 ? 30 : timeToPay;
    const d = new Date(invoiceDate);
    d.setDate(d.getDate() + days);
    dueDate = d.toISOString().substring(0, 10);
  }

  const paymentDate = inv.payDate ? inv.payDate.substring(0, 10) : null;

  const netAmount = parseAmount(inv.sumNet);
  const grossAmount = parseAmount(inv.sumGross);
  const vatAmount = parseAmount(inv.sumTax);

  // sevDesk invoiceType mapping:
  // AN = Anzahlung/Advance, TR = Teilrechnung/Partial, SR = Schlussrechnung/Final
  // RE = Dauerrechnung/Recurring → partial_invoice (no project link expected)
  const invoiceType = inv.invoiceType === 'AN' ? 'advance_invoice' :
                      inv.invoiceType === 'SR' ? 'final_invoice' :
                      inv.invoiceType === 'TR' ? 'partial_invoice' :
                      'partial_invoice'; // RE, MA, unknown → partial

  // sumGrossPay is often 0 even for paid invoices in older sevDesk records.
  // If status = 1000 (paid) and sumGrossPay = 0, use grossAmount as paid amount.
  const paymentStatus = mapInvoiceStatus(inv);
  const rawPaidAmount = parseAmount(inv.sumGrossPay || '0');
  const paidAmount = rawPaidAmount > 0 ? rawPaidAmount :
                     (paymentStatus === 'paid' ? grossAmount : 0);

  const confirmedOrderId = matchResult?.order?.id || existing?.confirmed_order_id || null;
  const matchStatus = matchResult ? 'auto_matched' : (existing?.match_status || 'unmatched');
  const matchConfidence = matchResult?.confidence || existing?.match_confidence || 0;

  return {
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
    open_amount: Math.max(0, grossAmount - paidAmount),
    payment_date: paymentStatus === 'paid' ? paymentDate : null,
    source_type: 'sevdesk',
    sevdesk_id: String(inv.id),
    confirmed_order_id: confirmedOrderId,
    match_status: matchStatus,
    match_confidence: matchConfidence,
    notes: inv.header || '',
    source_file: JSON.stringify(inv),
  };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ error: 'SEVDESK_API_KEY not set' }, { status: 500 });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    // offset/batchSize allow paginated syncs to avoid timeouts
    const limit = body.limit || 50;
    const offset = body.offset || 0;
    const year = body.year || null;

    // Fetch invoices from sevDesk (paginated)
    const data = await sevdeskGet(
      `/Invoice?limit=${limit}&offset=${offset}&embed=contact&orderBy=invoiceDate&orderDirection=desc`,
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

    // Load lookup data in bulk
    const [allOrders, existingInvoices] = await Promise.all([
      base44.asServiceRole.entities.ConfirmedOrder.list(),
      base44.asServiceRole.entities.InvoiceRecord.filter({ source_type: 'sevdesk' })
    ]);

    const existingMap = {};
    for (const r of existingInvoices) {
      if (r.sevdesk_id) existingMap[r.sevdesk_id] = r;
    }

    const ordersBySevdeskId = {};
    for (const o of allOrders) {
      const sid = extractSevdeskIdFromNotes(o.notes);
      if (sid) ordersBySevdeskId[sid] = o;
      // Also index by sevdesk_order_id field if present
      if (o.sevdesk_order_id) ordersBySevdeskId[String(o.sevdesk_order_id)] = o;
    }

    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < invoices.length; i++) {
      const inv = invoices[i];
      try {
        const sevdeskId = String(inv.id);
        const existing = existingMap[sevdeskId] || null;
        const matchResult = findMatchingOrder(inv, allOrders, ordersBySevdeskId);
        const record = buildRecord(inv, matchResult, existing);

        if (existing) {
          await base44.asServiceRole.entities.InvoiceRecord.update(existing.id, record);
          updated++;
        } else {
          await base44.asServiceRole.entities.InvoiceRecord.create(record);
          created++;
        }

        // 1s between writes to stay within rate limits
        await sleep(1000);

      } catch (e) {
        failed++;
        errors.push(`${inv.invoiceNumber}: ${e.message}`);
        // On rate limit, wait longer before continuing
        if (e.message?.includes('429') || e.message?.includes('Rate limit')) {
          await sleep(5000);
        } else {
          await sleep(1000);
        }
      }
    }

    await base44.asServiceRole.entities.AuditLog.create({
      action: 'import',
      entity_type: 'sevdesk_sync',
      entity_id: 'invoices',
      user_email: user.email || 'system',
      details: `sevDesk sync offset=${offset} limit=${limit}: ${created} neu, ${updated} aktualisiert, ${failed} Fehler. Jahr: ${year || 'alle'}`
    });

    return Response.json({
      success: true,
      fetched: invoices.length,
      created,
      updated,
      failed,
      offset,
      next_offset: offset + limit,
      has_more: (data.objects || []).length >= limit,
      errors: errors.slice(0, 10),
      message: `Sync offset=${offset}: ${created} neu, ${updated} aktualisiert, ${failed} Fehler`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});