import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';

async function sevdeskPost(path, apiKey, body) {
  const res = await fetch(`${SEVDESK_BASE}${path}`, {
    method: 'POST',
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`sevDesk API error ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function sevdeskGet(path, apiKey) {
  const res = await fetch(`${SEVDESK_BASE}${path}`, {
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`sevDesk GET error ${res.status}: ${await res.text()}`);
  return res.json();
}

// Rechnungstyp-Mapping
const INVOICE_TYPE_MAP = {
  advance_invoice: 'AN',  // Anzahlungsrechnung
  partial_invoice: 'RE',  // Teilrechnung
  final_invoice:   'RE',  // Schlussrechnung
  correction:      'SR',  // Stornorechnung
  credit_note:     'SR',
};

// Rechnungstyp-Betreff
const INVOICE_TYPE_HEADER = {
  advance_invoice: 'Anzahlungsrechnung',
  partial_invoice: 'Teilrechnung',
  final_invoice:   'Schlussrechnung',
  correction:      'Korrektur',
  credit_note:     'Gutschrift',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ error: 'SEVDESK_API_KEY not set' }, { status: 500 });

    const body = await req.json();
    const { billing_instruction_id } = body;

    if (!billing_instruction_id) {
      return Response.json({ error: 'billing_instruction_id required' }, { status: 400 });
    }

    // 1. Abrechnungsanweisung laden
    const instructions = await base44.asServiceRole.entities.BillingInstruction.filter({ id: billing_instruction_id });
    const instr = instructions?.[0];
    if (!instr) return Response.json({ error: 'BillingInstruction not found' }, { status: 404 });

    // 2. Kontakt-ID ermitteln — zuerst aus verknüpftem ConfirmedOrder
    let sevdeskContactId = null;
    let sevdeskOrderId = null;

    if (instr.confirmed_order_id) {
      const orders = await base44.asServiceRole.entities.ConfirmedOrder.filter({ id: instr.confirmed_order_id });
      const order = orders?.[0];
      if (order?.sevdesk_contact_id) sevdeskContactId = order.sevdesk_contact_id;
      if (order?.sevdesk_order_id) sevdeskOrderId = order.sevdesk_order_id;
    }

    // 3. Falls keine Kontakt-ID → per Kundenname in sevDesk suchen
    if (!sevdeskContactId && instr.customer_name) {
      const searchName = encodeURIComponent(instr.customer_name.substring(0, 30));
      const contactData = await sevdeskGet(`/Contact?name=${searchName}&limit=5`, apiKey);
      const contacts = contactData.objects || [];
      if (contacts.length > 0) {
        sevdeskContactId = String(contacts[0].id);
      }
    }

    if (!sevdeskContactId) {
      return Response.json({
        error: 'Kein sevDesk-Kontakt gefunden. Bitte die Auftragsbestätigung zuerst aus sevDesk importieren, damit die Kundennummer verknüpft wird.',
        customer_name: instr.customer_name
      }, { status: 422 });
    }

    // 4. Rechnungstext aufbauen
    const invoiceTypeLabel = INVOICE_TYPE_HEADER[instr.invoice_type] || 'Teilrechnung';
    const projectLabel = instr.project_name || '';
    const headerText = `${invoiceTypeLabel} — Vereinbarte Teilabrechnung${projectLabel ? ': ' + projectLabel : ''}`;

    const footText = instr.invoice_instruction_text
      ? instr.invoice_instruction_text
      : `${invoiceTypeLabel} gemäß Auftragsbestätigung.`;

    // 5. Rechnungsentwurf in sevDesk anlegen
    const today = new Date().toISOString().split('T')[0] + ' 00:00:00';
    const invoicePayload = {
      objectName: 'Invoice',
      mapAll: true,
      invoiceNumber: null, // sevDesk vergibt automatisch
      contact: { id: sevdeskContactId, objectName: 'Contact' },
      invoiceDate: today,
      header: headerText,
      headText: `Sehr geehrte Damen und Herren,\n\nwir erlauben uns, folgende ${invoiceTypeLabel} in Rechnung zu stellen:`,
      footText: footText,
      invoiceType: INVOICE_TYPE_MAP[instr.invoice_type] || 'RE',
      status: '100', // 100 = Entwurf
      taxRate: String(instr.vat_rate ?? 20),
      taxText: `${instr.vat_rate ?? 20}% MwSt.`,
      taxType: 'default',
      currency: 'EUR',
      // Auftragsreferenz falls vorhanden
      ...(sevdeskOrderId ? { order: { id: sevdeskOrderId, objectName: 'Order' } } : {}),
    };

    const invoiceResult = await sevdeskPost('/Invoice/Factory/saveInvoice', apiKey, {
      invoice: invoicePayload,
      invoicePosSave: [
        {
          objectName: 'InvoicePos',
          mapAll: true,
          part: null,
          quantity: '1',
          price: String(instr.instruction_amount_net ?? 0),
          name: headerText,
          unity: { id: '1', objectName: 'Unity' }, // Stück
          taxRate: String(instr.vat_rate ?? 20),
        }
      ],
      invoicePosDelete: null,
      discountSave: null,
      discountDelete: null,
    });

    const createdInvoice = invoiceResult?.objects?.invoice || invoiceResult?.invoice;
    const sevdeskInvoiceId = createdInvoice?.id;

    // 6. Abrechnungsanweisung aktualisieren — Status und sevDesk-Link
    if (sevdeskInvoiceId) {
      await base44.asServiceRole.entities.BillingInstruction.update(billing_instruction_id, {
        status: 'invoice_created',
        invoice_created_at: new Date().toISOString(),
      });
    }

    return Response.json({
      success: true,
      sevdesk_invoice_id: sevdeskInvoiceId,
      sevdesk_url: sevdeskInvoiceId ? `https://my.sevdesk.de/#/fi/${sevdeskInvoiceId}` : null,
      message: `Rechnungsentwurf erfolgreich in sevDesk angelegt (ID: ${sevdeskInvoiceId})`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});