import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ error: 'SEVDESK_API_KEY not set' }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    // Optionaler Filter: nur bestimmte ConfirmedOrder-IDs verarbeiten
    const filterOrderIds = body.order_ids ?? null; // Array<string> | null

    let targetOrders = [];

    if (filterOrderIds && filterOrderIds.length > 0) {
      // Gezielter Modus: nur die angegebenen Orders
      const all = await base44.asServiceRole.entities.ConfirmedOrder.list();
      targetOrders = all.filter(o => o.sevdesk_order_id && filterOrderIds.includes(o.id));
    } else {
      // Standard: nur Orders die einem aktiven Projekt zugeordnet sind
      const [allOrders, activeProjects] = await Promise.all([
        base44.asServiceRole.entities.ConfirmedOrder.list(),
        base44.asServiceRole.entities.LiquidityProject.filter({ is_active_for_billing: true }),
      ]);

      const activeProjectIds = new Set(activeProjects.map(p => p.id));

      targetOrders = allOrders.filter(o =>
        o.sevdesk_order_id &&
        o.project_id &&
        activeProjectIds.has(o.project_id)
      );
    }

    console.log(`Verarbeite ${targetOrders.length} ConfirmedOrders (aktive Projekte)`);

    let itemsCreated = 0;
    let itemsDeleted = 0;
    let ordersProcessed = 0;
    let ordersFailed = 0;
    const errors = [];

    for (const order of targetOrders) {
      try {
        const sevdeskId = order.sevdesk_order_id;

        // Positionen aus sevDesk fetchen
        const posData = await sevdeskGet(
          `/OrderPos?order[id]=${sevdeskId}&order[objectName]=Order&embed=part&limit=100`,
          apiKey
        );
        const positions = posData.objects || [];

        if (positions.length === 0) {
          await sleep(200);
          continue;
        }

        // Bestehende Items für diese Order löschen (falls vorhanden)
        const existingItems = await base44.asServiceRole.entities.ConfirmedOrderItem.filter({
          confirmed_order_id: order.id
        });
        for (const item of existingItems) {
          await base44.asServiceRole.entities.ConfirmedOrderItem.delete(item.id);
          itemsDeleted++;
        }

        // Neue Items erstellen
        let posNum = 1;
        for (const pos of positions) {
          const unitPrice = parseAmount(pos.price);
          const qty = parseFloat(pos.quantity || '1') || 1;
          await base44.asServiceRole.entities.ConfirmedOrderItem.create({
            confirmed_order_id: order.id,
            position: posNum++,
            title: pos.name || pos.part?.name || `Position ${posNum}`,
            description: pos.text || '',
            unit: pos.unity?.name || 'pauschal',
            unit_price: unitPrice,
            quantity: qty,
            total_price: unitPrice * qty,
            is_discount: parseAmount(pos.discount || 0) < 0,
            status: 'not_started',
          });
          itemsCreated++;
        }

        ordersProcessed++;
        console.log(`Order ${sevdeskId} (${order.customer}): ${positions.length} Positionen importiert`);

        await sleep(300);

      } catch (err) {
        ordersFailed++;
        errors.push(`${order.sevdesk_order_id}: ${err.message}`);
        console.error(`Fehler bei Order ${order.sevdesk_order_id}: ${err.message}`);
        await sleep(200);
      }
    }

    return Response.json({
      success: true,
      ordersTotal: targetOrders.length,
      ordersProcessed,
      ordersFailed,
      itemsDeleted,
      itemsCreated,
      errors: errors.slice(0, 20),
      message: `${ordersProcessed} Aufträge verarbeitet, ${itemsCreated} Positionen importiert`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});