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
  if (status === '750') return 'confirmed';  // Angenommen
  if (status === '500') return 'confirmed';  // Offen/In Bearbeitung
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

    const selectedIds = body.selectedIds || null;
    // YEAR GUARD: Nur 2025 und 2026 werden synchronisiert.
    // Dies schützt den bereinigten Datenstand nach dem Re-Import.
    // Alte Auftragsbestätigungen (2024 und früher) werden NICHT überschrieben.
    const year = body.year || null;
    const allowedYears = body.allowedYears || [2025, 2026]; // explizit überschreibbar
    const includeOrderItems = body.includeOrderItems === true;
    // Batch-Größe und Offset für inkrementellen Sync
    const batchSize = body.batch_size || 30;
    const offset = body.offset || 0;

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // Fetch only AB (Auftragsbestätigungen)
    const abData = await sevdeskGet(`/Order?orderType=AB&limit=${batchSize}&offset=${offset}&embed=contact&orderBy=orderDate&orderDirection=desc`, apiKey);

    let orders = abData.objects || [];
    const hasMore = orders.length === batchSize;

    // YEAR GUARD: Nur erlaubte Jahre importieren (Standard: 2025+2026)
    // Einzeljahr-Filter hat Vorrang, ansonsten allowedYears-Liste anwenden
    if (year) {
      orders = orders.filter(o => {
        const d = o.orderDate || o.deliveryDate || '';
        return d.startsWith(String(year));
      });
    } else {
      orders = orders.filter(o => {
        const d = o.orderDate || o.deliveryDate || '';
        return allowedYears.some(y => d.startsWith(String(y)));
      });
    }

    // Filter by selected IDs
    if (selectedIds && selectedIds.length > 0) {
      const idSet = new Set(selectedIds.map(String));
      orders = orders.filter(o => idSet.has(String(o.id)));
    }

    console.log(`sevDesk Aufträge offset=${offset}: ${orders.length} gefunden`);

    // Alle existierenden ConfirmedOrders einmal vorab laden (1 Query statt N)
    const allExisting = await base44.asServiceRole.entities.ConfirmedOrder.list();
    const existingByOrderNumber = {};
    const existingBySevdeskId = {};
    for (const e of allExisting) {
      if (e.order_number) existingByOrderNumber[e.order_number] = e;
      if (e.sevdesk_order_id) existingBySevdeskId[e.sevdesk_order_id] = e;
    }

    let created = 0;
    let updated = 0;
    let failed = 0;
    let itemsCreated = 0;

    for (const ord of orders) {
      try {
        const sevdeskId = String(ord.id);
        const orderNumber = ord.header || ord.orderNumber || `sevDesk-${sevdeskId}`;

        const orderDate = ord.orderDate ? ord.orderDate.substring(0, 10) : null;
        const netAmount = parseAmount(ord.sumNet);
        const grossAmount = parseAmount(ord.sumGross);
        const vatRate = netAmount > 0 ? Math.round(((grossAmount - netAmount) / netAmount) * 100) : 20;

        const contactId = ord.contact?.id ? String(ord.contact.id) : null;

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
          sevdesk_order_id: sevdeskId,
          ...(contactId ? { sevdesk_contact_id: contactId } : {}),
        };

        const existing = existingByOrderNumber[orderNumber] || existingBySevdeskId[sevdeskId];
        let confirmedOrderId;

        if (existing) {
          await base44.asServiceRole.entities.ConfirmedOrder.update(existing.id, record);
          confirmedOrderId = existing.id;
          updated++;
        } else {
          const created_record = await base44.asServiceRole.entities.ConfirmedOrder.create(record);
          confirmedOrderId = created_record.id;
          created++;
        }

        // Positionen nur bei explizitem manuellem Aufruf
        if (includeOrderItems && confirmedOrderId) {
          try {
            const posData = await sevdeskGet(`/OrderPos?order[id]=${sevdeskId}&order[objectName]=Order&embed=part&limit=100`, apiKey);
            const positions = posData.objects || [];
            const existingItems = await base44.asServiceRole.entities.ConfirmedOrderItem.filter({ confirmed_order_id: confirmedOrderId });
            await Promise.all(existingItems.map(item => base44.asServiceRole.entities.ConfirmedOrderItem.delete(item.id)));
            let posNum = 1;
            for (const pos of positions) {
              const unitPrice = parseAmount(pos.price);
              const qty = parseFloat(pos.quantity || '1') || 1;
              await base44.asServiceRole.entities.ConfirmedOrderItem.create({
                confirmed_order_id: confirmedOrderId,
                position: posNum++,
                title: pos.name || pos.part?.name || `Position ${posNum}`,
                description: pos.text || '',
                unit: pos.unity?.name || 'pauschal',
                unit_price: unitPrice,
                quantity: qty,
                total_price: unitPrice * qty,
                is_discount: (pos.discount || 0) < 0,
                status: 'not_started',
              });
              itemsCreated++;
            }
          } catch { /* positions not critical */ }
        }

        await sleep(300);

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
      itemsCreated,
      offset,
      next_offset: offset + batchSize,
      has_more: hasMore,
      message: `sevDesk Aufträge offset=${offset}: ${created} neu, ${updated} aktualisiert, ${failed} Fehler`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});