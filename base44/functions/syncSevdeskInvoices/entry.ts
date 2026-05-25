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

function extractSevdeskIdFromNotes(notes) {
  // Notes field contains e.g. "sevDesk ID: 25809765 | Typ: AB"
  const match = (notes || '').match(/sevDesk ID:\s*(\d+)/i);
  return match ? match[1] : null;
}

function findMatchingOrder(invoice, confirmedOrders, ordersBySevdeskId) {
  // 1. Exact match via origin field (invoice created from an Order in sevDesk)
  const originId = invoice.origin?.id;
  if (originId && invoice.origin?.objectName === 'Order') {
    const exactMatch = ordersBySevdeskId[originId];
    if (exactMatch) {
      return { order: exactMatch, confidence: 100, method: 'sevdesk_origin' };
    }
  }

  // 2. Fuzzy fallback: customer name + amount
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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function saveWithRetry(base44, existing, record, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (existing) {
        await base44.asServiceRole.entities.InvoiceRecord.update(existing.id, record);
      } else {
        await base44.asServiceRole.entities.InvoiceRecord.create(record);
      }
      return true;
    } catch (e) {
      if (attempt < retries - 1) {
        await sleep(1000 * (attempt + 1)); // 1s, 2s backoff
      } else {
        throw e;
      }
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ error: 'SEVDESK_API_KEY not set' }, { status: 500 });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const limit = body.limit || 200;
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

    // Load everything needed in bulk upfront (avoids per-record DB calls)
    const [allOrders, existingInvoices] = await Promise.all([
      base44.asServiceRole.entities.ConfirmedOrder.list(),
      base44.asServiceRole.entities.InvoiceRecord.filter({ source_type: 'sevdesk' })
    ]);

    // Build lookup map: sevdesk_id → existing InvoiceRecord
    const existingMap = {};
    for (const r of existingInvoices) {
      if (r.sevdesk_id) existingMap[r.sevdesk_id] = r;
    }

    // Build lookup map: sevdesk order id → ConfirmedOrder (from notes field)
    const ordersBySevdeskId = {};
    for (const o of allOrders) {
      const sid = extractSevdeskIdFromNotes(o.notes);
      if (sid) ordersBySevdeskId[sid] = o;
    }

    let created = 0;
    let updated = 0;
    let failed = 0;
    let matched = 0;
    let skipped = 0;

    for (let i = 0; i < invoices.length; i++) {
      const inv = invoices[i];
      try {
        const sevdeskId = String(inv.id);
        const existing = existingMap[sevdeskId] || null;

        // Alle Rechnungen importieren — auch ohne AB-Zuordnung
        const matchResult = findMatchingOrder(inv, allOrders, ordersBySevdeskId);

        const invoiceDate = inv.invoiceDate ? inv.invoiceDate.substring(0, 10) : null;

        // due_date: sevDesk payDate, sonst invoiceDate + timeToPay (Zahlungsziel in Tagen), sonst +30 Tage Fallback
        let dueDate = null;
        if (inv.payDate) {
          dueDate = inv.payDate.substring(0, 10);
        } else if (invoiceDate) {
          const timeToPay = parseInt(inv.timeToPay || inv.discountTime || '30', 10);
          const days = isNaN(timeToPay) || timeToPay <= 0 ? 30 : timeToPay;
          const d = new Date(invoiceDate);
          d.setDate(d.getDate() + days);
          dueDate = d.toISOString().substring(0, 10);
        }

        const paymentDate = inv.entryDate ? inv.entryDate.substring(0, 10) : null;

        const netAmount = parseAmount(inv.sumNet);
        const grossAmount = parseAmount(inv.sumGross);
        const vatAmount = parseAmount(inv.sumTax);
        const paidAmount = parseAmount(inv.sumGrossPay || '0');

        const invoiceType = inv.invoiceType === 'AN' ? 'advance_invoice' :
                            inv.invoiceType === 'RE' ? 'partial_invoice' : 'final_invoice';

        const paymentStatus = mapInvoiceStatus(inv);

        const confirmedOrderId = matchResult?.order?.id || existing?.confirmed_order_id || null;
        const matchStatus = matchResult ? 'auto_matched' : (existing?.match_status || 'unmatched');
        const matchConfidence = matchResult?.confidence || existing?.match_confidence || 0;

        matched++;

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
          source_file: JSON.stringify(inv), // Raw sevDesk Payload für Nachvollziehbarkeit
        };

        await saveWithRetry(base44, existing, record);
        if (existing) updated++; else created++;

        // Delay every 5 records to avoid rate limiting
        if (i > 0 && i % 5 === 0) await sleep(500);

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
      message: `sevDesk Rechnungen synchronisiert: ${created} neu, ${updated} aktualisiert, ${matched} Aufträgen zugeordnet, ${skipped} übersprungen (kein AB), ${failed} Fehler`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});