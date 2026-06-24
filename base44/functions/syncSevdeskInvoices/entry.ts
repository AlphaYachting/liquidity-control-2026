import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';

async function sevdeskGet(path, apiKey) {
  const res = await fetch(`${SEVDESK_BASE}${path}`, {
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`sevDesk API error ${res.status}: ${await res.text()}`);
  return res.json();
}

// Für Teilzahlungen: Einzelrechnung mit embed=payments abrufen
async function fetchPaidAmount(invoiceId, grossAmount, apiKey) {
  try {
    const data = await sevdeskGet(`/Invoice/${invoiceId}?embed=payments`, apiKey);
    const inv = data.objects?.[0] || data.object;
    if (!inv) return { paid: 0, open: grossAmount, _debug: { error: 'no object', keys: Object.keys(data) } };

    const rawPay = parseFloat(inv.sumGrossPay || '0');
    const rawRemaining = parseFloat(inv.sumRemaining || '0');
    const payments = inv.payments || [];

    const _debug = {
      sumGrossPay: inv.sumGrossPay,
      sumRemaining: inv.sumRemaining,
      payments_count: payments.length,
      payments_sample: payments[0],
      all_keys: Object.keys(inv).filter(k => k.toLowerCase().includes('sum') || k.toLowerCase().includes('pay')),
    };

    if (rawPay > 0 || rawRemaining > 0) {
      const paid = rawPay > 0 ? rawPay : grossAmount - rawRemaining;
      const open = rawRemaining > 0 ? rawRemaining : Math.max(0, grossAmount - paid);
      return { paid: Math.round(paid * 100) / 100, open: Math.round(open * 100) / 100, _debug };
    }

    if (payments.length > 0) {
      const paid = payments.reduce((s, p) => s + parseFloat(p.amount || p.sumGross || '0'), 0);
      return { paid: Math.round(paid * 100) / 100, open: Math.max(0, Math.round((grossAmount - paid) * 100) / 100), _debug };
    }

    return { paid: 0, open: grossAmount, _debug };
  } catch(e) {
    return { paid: 0, open: grossAmount, _debug: { error: e.message } };
  }
}

function mapInvoiceStatus(invoice) {
  const status = invoice.status;
  if (status === '1000') return 'paid';
  if (status === '750') return 'partially_paid'; // sevDesk: teilweise bezahlt
  if (status === '300') return 'partially_paid'; // sevDesk: älter, ebenfalls teilbezahlt
  if (status === '50') return 'cancelled';
  if (status === '100') return 'draft';
  if (status === '200') return 'open'; // versendet, noch nicht fällig
  return 'open';
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

// Skip draft and cancelled invoices from matching to avoid re-linking
function shouldSkipMatching(inv) {
  return inv.status === '100' || inv.status === '50'; // draft or cancelled
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

  const paymentStatus = mapInvoiceStatus(inv);

  // Bezahlter Betrag aus sumGrossPay (wird von sevDesk mit embed=payments befüllt)
  // Für status=1000 (voll bezahlt) nutzen wir grossAmount als Fallback
  const rawPaidAmount = parseAmount(inv.sumGrossPay || '0');
  const paidAmount = rawPaidAmount > 0 ? rawPaidAmount :
                     (paymentStatus === 'paid' ? grossAmount : 0);

  // Offener Betrag: bei paid=0, aber Status teilbezahlt → grossAmount stehen lassen
  // sumRemaining aus der API ist die verlässlichste Quelle wenn vorhanden
  const rawRemaining = parseAmount(inv.sumRemaining || '0');
  let openAmount;
  if (paymentStatus === 'paid') {
    openAmount = 0;
  } else if (rawRemaining > 0) {
    openAmount = rawRemaining; // sevDesk sagt direkt was noch offen ist
  } else if (paidAmount > 0) {
    openAmount = Math.max(0, grossAmount - paidAmount);
  } else {
    openAmount = grossAmount; // Kein Zahlungsinfo → alles noch offen
  }

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
    open_amount: openAmount,
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
    // YEAR GUARD: Nur 2025 und 2026 werden synchronisiert.
    // Schützt den bereinigten Datenstand nach Re-Import.
    const allowedYears = body.allowedYears || [2025, 2026];

    // Fetch invoices from sevDesk (paginated)
    const data = await sevdeskGet(
      `/Invoice?limit=${limit}&offset=${offset}&embed=contact,payments&orderBy=invoiceDate&orderDirection=desc`,
      apiKey
    );

    let invoices = data.objects || [];

    // YEAR GUARD: Einzeljahr-Filter hat Vorrang, ansonsten allowedYears-Liste anwenden
    if (year) {
      invoices = invoices.filter(inv => {
        const d = inv.invoiceDate || '';
        return d.startsWith(String(year));
      });
    } else {
      invoices = invoices.filter(inv => {
        const d = inv.invoiceDate || '';
        return allowedYears.some(y => d.startsWith(String(y)));
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

    // Debug-Modus: Zeige Rohfelder für bestimmte Rechnungsnummern
    const debugNrs = new Set(body.debugNrs || []);

    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors = [];
    const debugResults = [];

    for (let i = 0; i < invoices.length; i++) {
      const inv = invoices[i];
      try {
        const sevdeskId = String(inv.id);
        const existing = existingMap[sevdeskId] || null;

        if (debugNrs.has(inv.invoiceNumber)) {
          debugResults.push({
            nr: inv.invoiceNumber,
            status: inv.status,
            sumGross: inv.sumGross,
            sumNet: inv.sumNet,
            sumGrossPay: inv.sumGrossPay,
            sumRemaining: inv.sumRemaining,
            sumTax: inv.sumTax,
            timeToPay: inv.timeToPay,
          });
        }
        // Skip matching for drafts (100) and cancelled (50) — never re-link them
        const matchResult = shouldSkipMatching(inv) ? null : findMatchingOrder(inv, allOrders, ordersBySevdeskId);
        // If already manually matched, don't overwrite with auto-match
        const effectiveMatch = (existing?.match_status === 'manually_matched') ? null : matchResult;
        let record = buildRecord(inv, effectiveMatch, existing);

        // Für Teilzahlungen: Payments separat abrufen (sevDesk liefert sumGrossPay nicht im Listen-Endpoint)
        if (record.payment_status === 'partially_paid') {
          const { paid, open, _debug } = await fetchPaidAmount(sevdeskId, record.gross_amount, apiKey);
          record.paid_amount = paid;
          record.open_amount = open;
          if (debugNrs.has(inv.invoiceNumber)) {
            debugResults.push({ nr: inv.invoiceNumber, fetchDebug: _debug });
          }
          await sleep(300);
        }

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
      message: `Sync offset=${offset}: ${created} neu, ${updated} aktualisiert, ${failed} Fehler`,
      ...(debugResults.length > 0 ? { debug: debugResults } : {})
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});