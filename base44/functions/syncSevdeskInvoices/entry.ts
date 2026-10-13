import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import {
  sevdeskGet, fetchPaidAmount, findMatchingOrder, shouldSkipMatching, buildRecord, mitAnweisungVerknuepfen,
} from "../../shared/sevdeskRechnung.js";
import { statusAusSevdesk, anweisungAngleichen, alleSeiten } from "../../shared/billingFollow.js";

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
    const [allOrders, existingInvoices, instrMitRechnung] = await Promise.all([
      base44.asServiceRole.entities.ConfirmedOrder.list(),
      base44.asServiceRole.entities.InvoiceRecord.filter({ source_type: 'sevdesk' }),
      // Seitenweise: ein Einzelaufruf lieferte höchstens 50 Anweisungen.
      alleSeiten((l, s) => base44.asServiceRole.entities.BillingInstruction.filter({ sevdesk_invoice_id: { $nin: [null, ''] } }, '-created_date', l, s)),
    ]);
    // Sichere Verknüpfung: Anweisung kennt die sevDesk-Rechnungs-ID
    const instrBySevdeskId = {};
    for (const b of instrMitRechnung) {
      if (b.sevdesk_invoice_id) instrBySevdeskId[String(b.sevdesk_invoice_id)] = b;
    }

    const existingMap = {};
    const recordIdBySevdeskId = {};
    const recordById = {};
    for (const r of existingInvoices) {
      if (r.sevdesk_id) {
        existingMap[r.sevdesk_id] = r;
        recordIdBySevdeskId[r.sevdesk_id] = r.id;
      }
      recordById[r.id] = r;
    }

    const ordersById = Object.fromEntries(allOrders.map(o => [o.id, o]));

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
    let linked_via_instruction = 0;
    let status_nachgezogen = 0;
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
        let record = buildRecord(inv, effectiveMatch, existing, recordIdBySevdeskId, recordById, ordersById);

        // Vorrang: Verknüpfung über die Abrechnungsanweisung (auch für Entwürfe)
        const instr = instrBySevdeskId[sevdeskId] || null;
        if (mitAnweisungVerknuepfen(record, instr, existing)) linked_via_instruction++;

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

        let recordId;
        if (existing) {
          await base44.asServiceRole.entities.InvoiceRecord.update(existing.id, record);
          recordId = existing.id;
          updated++;
        } else {
          const neu = await base44.asServiceRole.entities.InvoiceRecord.create(record);
          recordId = neu.id;
          created++;
        }

        if (instr && !instr.linked_invoice_id && recordId) {
          await base44.asServiceRole.entities.BillingInstruction.update(instr.id, { linked_invoice_id: recordId });
        }

        // Status der Anweisung folgt dem sevDesk-Beleg (gleiche Regel wie der Morgenlauf:
        // nur Status, nie Betrag) — und die verknüpfte Verrechnungsplanung zieht mit.
        if (instr) {
          try {
            if (await anweisungAngleichen(base44.asServiceRole.entities, instr, statusAusSevdesk(inv.status))) status_nachgezogen++;
          } catch (e) {
            errors.push(`${inv.invoiceNumber}: Anweisung nicht nachgezogen — ${e.message}`);
          }
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
      details: `sevDesk sync offset=${offset} limit=${limit}: ${created} neu, ${updated} aktualisiert, ${failed} Fehler, ${status_nachgezogen} Anweisungen nachgezogen. Jahr: ${year || 'alle'}`
    });

    return Response.json({
      success: true,
      fetched: invoices.length,
      created,
      updated,
      failed,
      linked_via_instruction,
      status_nachgezogen,
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