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

    // selectedIds: array of sevDesk order IDs to import (if empty, import all)
    const selectedIds = body.selectedIds || null; // null = no filter
    const year = body.year || null;
    const includeOrderItems = body.includeOrderItems !== false; // default true
    const limit = body.limit || 500;

    // Fetch all orders
    const [abData, anData] = await Promise.all([
      sevdeskGet(`/Order?orderType=AB&limit=${limit}&offset=0&embed=contact&orderBy=orderDate&orderDirection=desc`, apiKey),
      sevdeskGet(`/Order?orderType=AN&limit=${limit}&offset=0&embed=contact&orderBy=orderDate&orderDirection=desc`, apiKey),
    ]);

    let orders = [...(abData.objects || []), ...(anData.objects || [])];

    // Filter by year
    if (year) {
      orders = orders.filter(o => {
        const d = o.orderDate || o.deliveryDate || '';
        return d.startsWith(String(year));
      });
    }

    // Filter by selected IDs
    if (selectedIds && selectedIds.length > 0) {
      const idSet = new Set(selectedIds.map(String));
      orders = orders.filter(o => idSet.has(String(o.id)));
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

        // Check existing by order_number
        const existing = await base44.asServiceRole.entities.ConfirmedOrder.filter({ order_number: orderNumber });
        let confirmedOrderId;

        if (existing && existing.length > 0) {
          await base44.asServiceRole.entities.ConfirmedOrder.update(existing[0].id, record);
          confirmedOrderId = existing[0].id;
          updated++;
        } else {
          const created_record = await base44.asServiceRole.entities.ConfirmedOrder.create(record);
          confirmedOrderId = created_record.id;
          created++;
        }

        // Fetch and import order positions (Auftragspositionen)
        if (includeOrderItems && confirmedOrderId) {
          try {
            const posData = await sevdeskGet(`/OrderPos?order[id]=${sevdeskId}&order[objectName]=Order&embed=part&limit=100`, apiKey);
            const positions = posData.objects || [];

            // Delete existing items for this order first
            const existingItems = await base44.asServiceRole.entities.ConfirmedOrderItem.filter({ confirmed_order_id: confirmedOrderId });
            for (const item of existingItems) {
              await base44.asServiceRole.entities.ConfirmedOrderItem.delete(item.id);
            }

            // Create new items
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
          } catch {
            // positions not critical
          }
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
      itemsCreated,
      message: `sevDesk Aufträge synchronisiert: ${created} neu, ${updated} aktualisiert, ${itemsCreated} Positionen importiert, ${failed} Fehler`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});