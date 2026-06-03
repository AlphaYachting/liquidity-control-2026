import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
  const s = order.status;
  if (s === '1000') return 'completed';
  if (s === '50') return 'cancelled';
  if (s === '100') return 'draft';
  return 'confirmed';
}

function mapInvoiceStatus(inv) {
  if (inv.status === '1000') return 'paid';
  if (inv.status === '50') return 'cancelled';
  if (inv.status === '100') return 'draft';
  return 'open';
}

// Fetch ALL ABs from sevDesk with server-side year filter (startDate parameter)
async function fetchAllOrders(apiKey, startDate, endDate) {
  const allOrders = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const url = `/Order?orderType=AB&limit=${limit}&offset=${offset}&embed=contact&startDate=${startDate}&endDate=${endDate}&orderBy=orderDate&orderDirection=desc`;
    const data = await sevdeskGet(url, apiKey);
    const batch = data.objects || [];
    allOrders.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
    await sleep(300);
  }
  return allOrders;
}

// Fetch ALL invoices linked to a specific sevDesk order ID
async function fetchInvoicesForOrder(apiKey, sevdeskOrderId) {
  const url = `/Invoice?origin[id]=${sevdeskOrderId}&origin[objectName]=Order&embed=contact&limit=100`;
  const data = await sevdeskGet(url, apiKey);
  return data.objects || [];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ error: 'SEVDESK_API_KEY not set' }, { status: 500 });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = body.action || 'status'; // 'status' | 'reset_orders' | 'reset_invoices' | 'import_orders' | 'import_invoices'

    // ── STATUS: count existing records ──────────────────────────────────────
    if (action === 'status') {
      const [orders, invoices] = await Promise.all([
        base44.asServiceRole.entities.ConfirmedOrder.list(),
        base44.asServiceRole.entities.InvoiceRecord.list(),
      ]);
      const ordersByYear = {};
      for (const o of orders) {
        const y = (o.confirmation_date || o.created_date || '').substring(0, 4) || 'unbekannt';
        ordersByYear[y] = (ordersByYear[y] || 0) + 1;
      }
      const invoicesByYear = {};
      for (const i of invoices) {
        const y = (i.invoice_date || i.created_date || '').substring(0, 4) || 'unbekannt';
        invoicesByYear[y] = (invoicesByYear[y] || 0) + 1;
      }
      return Response.json({
        success: true,
        total_orders: orders.length,
        total_invoices: invoices.length,
        orders_by_year: ordersByYear,
        invoices_by_year: invoicesByYear,
      });
    }

    // ── RESET ORDERS: delete all ConfirmedOrders + ConfirmedOrderItems ──────
    if (action === 'reset_orders') {
      // Fetch ALL records (paginate to get beyond 50-record limit)
      async function listAll(entity) {
        const all = [];
        let skip = 0;
        const limit = 100;
        while (true) {
          const batch = await entity.list(null, limit, skip);
          all.push(...batch);
          if (batch.length < limit) break;
          skip += limit;
          await sleep(200);
        }
        return all;
      }

      const [orders, items, blocks] = await Promise.all([
        listAll(base44.asServiceRole.entities.ConfirmedOrder),
        listAll(base44.asServiceRole.entities.ConfirmedOrderItem),
        listAll(base44.asServiceRole.entities.ProjectBillingBlock),
      ]);

      const orderIds = new Set(orders.map(o => o.id));
      const linkedBlocks = blocks.filter(b => b.confirmed_order_id && orderIds.has(b.confirmed_order_id));

      let deletedOrders = 0;
      let deletedItems = 0;
      let unlinkedBlocks = 0;

      // Unlink billing blocks first
      for (const b of linkedBlocks) {
        await base44.asServiceRole.entities.ProjectBillingBlock.update(b.id, { confirmed_order_id: null });
        unlinkedBlocks++;
        await sleep(200);
      }

      // Delete order items
      for (const item of items) {
        await base44.asServiceRole.entities.ConfirmedOrderItem.delete(item.id);
        deletedItems++;
        await sleep(150);
      }

      // Delete orders (in batches with longer pauses)
      for (let i = 0; i < orders.length; i++) {
        await base44.asServiceRole.entities.ConfirmedOrder.delete(orders[i].id);
        deletedOrders++;
        // Every 20 deletes, pause 2 seconds to avoid rate limit
        if (i > 0 && i % 20 === 0) {
          await sleep(2000);
        } else {
          await sleep(200);
        }
      }

      return Response.json({
        success: true,
        deleted_orders: deletedOrders,
        deleted_items: deletedItems,
        unlinked_blocks: unlinkedBlocks,
        message: `${deletedOrders} ABs gelöscht, ${deletedItems} Positionen gelöscht, ${unlinkedBlocks} Leistungspakete entknüpft`
      });
    }

    // ── RESET INVOICES: delete all InvoiceRecords ────────────────────────────
    if (action === 'reset_invoices') {
      const all = [];
      let skip = 0;
      const limit = 100;
      while (true) {
        const batch = await base44.asServiceRole.entities.InvoiceRecord.list(null, limit, skip);
        all.push(...batch);
        if (batch.length < limit) break;
        skip += limit;
        await sleep(200);
      }
      let deleted = 0;
      for (let i = 0; i < all.length; i++) {
        await base44.asServiceRole.entities.InvoiceRecord.delete(all[i].id);
        deleted++;
        if (i > 0 && i % 20 === 0) {
          await sleep(2000);
        } else {
          await sleep(200);
        }
      }
      return Response.json({
        success: true,
        deleted_invoices: deleted,
        message: `${deleted} Rechnungen gelöscht`
      });
    }

    // ── IMPORT ORDERS: fetch ABs from sevDesk 2025+2026 ─────────────────────
    if (action === 'import_orders') {
      const orders2025 = await fetchAllOrders(apiKey, '01.01.2025', '31.12.2025');
      const orders2026 = await fetchAllOrders(apiKey, '01.01.2026', '31.12.2026');
      const allOrders = [...orders2025, ...orders2026];

      console.log(`sevDesk: ${orders2025.length} ABs 2025, ${orders2026.length} ABs 2026`);

      let created = 0;
      let failed = 0;
      const errors = [];

      for (const ord of allOrders) {
        try {
          const sevdeskId = String(ord.id);
          const orderNumber = ord.header || `sevDesk-${sevdeskId}`;
          const orderDate = ord.orderDate ? ord.orderDate.substring(0, 10) : null;
          const netAmount = parseAmount(ord.sumNet);
          const grossAmount = parseAmount(ord.sumGross);
          const vatRate = netAmount > 0 ? Math.round(((grossAmount - netAmount) / netAmount) * 100) : 20;
          const contactId = ord.contact?.id ? String(ord.contact.id) : null;

          await base44.asServiceRole.entities.ConfirmedOrder.create({
            order_number: orderNumber,
            customer: ord.contact?.name || '',
            project_name: ord.header || `sevDesk-${sevdeskId}`,
            confirmation_date: orderDate,
            total_net_amount: netAmount,
            total_gross_amount: grossAmount,
            vat_rate: vatRate,
            payment_terms: ord.paymentTerms || '',
            status: mapOrderStatus(ord),
            source_type: 'sevdesk',
            notes: `sevDesk ID: ${sevdeskId} | Typ: AB`,
            sevdesk_order_id: sevdeskId,
            ...(contactId ? { sevdesk_contact_id: contactId } : {}),
          });
          created++;
          await sleep(200);
        } catch (e) {
          failed++;
          errors.push(e.message);
        }
      }

      return Response.json({
        success: true,
        total_from_sevdesk: allOrders.length,
        created,
        failed,
        errors: errors.slice(0, 10),
        message: `${created} ABs importiert (2025+2026), ${failed} Fehler`
      });
    }

    // ── IMPORT INVOICES: fetch invoices linked to imported orders ────────────
    if (action === 'import_invoices') {
      // Load all freshly imported orders
      const allOrders = await base44.asServiceRole.entities.ConfirmedOrder.list();
      const ordersBySevdeskId = {};
      for (const o of allOrders) {
        if (o.sevdesk_order_id) ordersBySevdeskId[o.sevdesk_order_id] = o;
      }

      let created = 0;
      let failed = 0;
      let skipped = 0;
      const errors = [];

      for (const order of allOrders) {
        if (!order.sevdesk_order_id) { skipped++; continue; }
        try {
          const invoices = await fetchInvoicesForOrder(apiKey, order.sevdesk_order_id);
          for (const inv of invoices) {
            try {
              const invoiceDate = inv.invoiceDate ? inv.invoiceDate.substring(0, 10) : null;
              const netAmount = parseAmount(inv.sumNet);
              const grossAmount = parseAmount(inv.sumGross);
              const vatAmount = parseAmount(inv.sumTax);
              const paymentStatus = mapInvoiceStatus(inv);
              const rawPaid = parseAmount(inv.paidAmount || inv.sumGrossPay || '0');
              const paidAmount = rawPaid > 0 ? rawPaid : (paymentStatus === 'paid' ? grossAmount : 0);

              const invoiceType = inv.invoiceType === 'AN' ? 'advance_invoice'
                                : inv.invoiceType === 'SR' ? 'final_invoice'
                                : 'partial_invoice';

              let dueDate = null;
              if (invoiceDate) {
                const days = parseInt(inv.timeToPay || '30', 10) || 30;
                const d = new Date(invoiceDate);
                d.setDate(d.getDate() + days);
                dueDate = d.toISOString().substring(0, 10);
              }

              await base44.asServiceRole.entities.InvoiceRecord.create({
                invoice_number: inv.invoiceNumber || '',
                invoice_date: invoiceDate,
                customer_name: inv.contact?.name || '',
                invoice_type: invoiceType,
                net_amount: netAmount,
                gross_amount: grossAmount,
                vat_amount: vatAmount,
                vat_rate: netAmount > 0 ? Math.round((vatAmount / netAmount) * 100) : 20,
                due_date: dueDate,
                payment_status: paymentStatus,
                paid_amount: paidAmount,
                open_amount: Math.max(0, grossAmount - paidAmount),
                payment_date: paymentStatus === 'paid' && inv.payDate ? inv.payDate.substring(0, 10) : null,
                source_type: 'sevdesk',
                sevdesk_id: String(inv.id),
                confirmed_order_id: order.id,
                match_status: 'auto_matched',
                match_confidence: 100,
                notes: inv.header || '',
                source_file: JSON.stringify(inv),
              });
              created++;
              await sleep(200);
            } catch (e) {
              failed++;
              errors.push(`Invoice ${inv.invoiceNumber}: ${e.message}`);
            }
          }
          await sleep(300);
        } catch (e) {
          failed++;
          errors.push(`Order ${order.sevdesk_order_id}: ${e.message}`);
        }
      }

      return Response.json({
        success: true,
        orders_processed: allOrders.length,
        created,
        failed,
        skipped,
        errors: errors.slice(0, 20),
        message: `${created} Rechnungen importiert, ${failed} Fehler`
      });
    }

    return Response.json({ error: `Unbekannte Aktion: ${action}` }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});