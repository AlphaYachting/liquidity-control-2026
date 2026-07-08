import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Einmalige Bereinigung: sevDesk-Korrektur-/Stornobelege im Bestand korrekt klassifizieren.
//
// sevDesk erstellt bei einer Stornierung eine Gegenrechnung mit negativem Betrag,
// deren origin.objectName === 'Invoice' auf die Ursprungsrechnung zeigt. Diese Belege
// wurden bisher als reguläre Rechnungen (final_invoice, is_credit_note=false) importiert,
// wodurch sie den Auftragsbestand fälschlich als abgerechnet erscheinen liessen.
//
// Diese Funktion:
//  - findet alle sevDesk-Belege mit gespeichertem Rohpayload (source_file), deren
//    origin auf eine Rechnung zeigt UND deren Nettobetrag negativ ist
//  - setzt invoice_type='correction', is_credit_note=true
//  - verknüpft original_invoice_id mit der Ursprungsrechnung (sofern im Bestand vorhanden)
//
// KEINE Seiteneffekte: Beträge, payment_status, is_sent, paid_amount, open_amount und
// alle NICHT betroffenen Rechnungen bleiben unverändert. Mit dryRun=true (Default)
// wird nur analysiert, ohne zu schreiben.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const dryRun = body.dryRun !== false; // Default: nur analysieren

    const invoices = await base44.asServiceRole.entities.InvoiceRecord.filter({ source_type: 'sevdesk' });

    // Lookup: sevDesk-ID → interne Record-ID (für Verknüpfung zur Ursprungsrechnung)
    const recordIdBySevdeskId = {};
    for (const r of invoices) {
      if (r.sevdesk_id) recordIdBySevdeskId[r.sevdesk_id] = r.id;
    }

    const candidates = [];
    for (const r of invoices) {
      if (!r.source_file) continue;
      let inv;
      try { inv = JSON.parse(r.source_file); } catch { continue; }

      const originIsInvoice = inv.origin?.objectName === 'Invoice';
      const net = parseFloat(inv.sumNet || r.net_amount || '0') || 0;
      const isCorrection = originIsInvoice && net < 0;
      if (!isCorrection) continue;

      const originSevdeskId = String(inv.origin?.id || '');
      const originalInvoiceId = recordIdBySevdeskId[originSevdeskId] || r.original_invoice_id || null;

      const needsUpdate =
        r.invoice_type !== 'correction' ||
        r.is_credit_note !== true ||
        (originalInvoiceId && r.original_invoice_id !== originalInvoiceId);

      if (!needsUpdate) continue;

      candidates.push({
        id: r.id,
        invoice_number: r.invoice_number,
        customer_name: r.customer_name,
        net_amount: r.net_amount,
        before: { invoice_type: r.invoice_type, is_credit_note: r.is_credit_note, original_invoice_id: r.original_invoice_id },
        after: { invoice_type: 'correction', is_credit_note: true, original_invoice_id: originalInvoiceId },
        origin_sevdesk_id: originSevdeskId,
        origin_linked: !!recordIdBySevdeskId[originSevdeskId],
      });
    }

    let updated = 0;
    if (!dryRun) {
      for (const c of candidates) {
        await base44.asServiceRole.entities.InvoiceRecord.update(c.id, {
          invoice_type: 'correction',
          is_credit_note: true,
          original_invoice_id: c.after.original_invoice_id,
        });
        updated++;
      }
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'update',
        entity_type: 'invoice_reclassify',
        entity_id: 'correction_invoices',
        user_email: user.email || 'system',
        details: `Korrektur-Reklassifizierung: ${updated} Stornobelege als Gutschrift markiert und verknüpft.`,
      });
    }

    return Response.json({
      success: true,
      dryRun,
      candidates_found: candidates.length,
      updated,
      candidates,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});