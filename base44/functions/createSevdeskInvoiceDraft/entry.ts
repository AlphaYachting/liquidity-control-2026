import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';

async function sevdeskPost(path, apiKey, body) {
  const res = await fetch(`${SEVDESK_BASE}${path}`, {
    method: 'POST',
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`sevDesk API error ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

async function sevdeskGet(path, apiKey) {
  const res = await fetch(`${SEVDESK_BASE}${path}`, {
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`sevDesk GET error ${res.status}: ${await res.text()}`);
  return res.json();
}

// Sucht SevUser-ID anhand eines Namens (Vorname oder Nachname reicht)
async function findSevUserId(name, apiKey) {
  if (!name) return null;
  try {
    const firstName = name.trim().split(' ')[0];
    const resp = await sevdeskGet(`/SevUser?limit=25`, apiKey);
    const users = resp.objects || [];
    // Suche nach Vorname-Match (case-insensitive)
    const match = users.find(u => {
      const full = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
      return full.includes(firstName.toLowerCase());
    });
    return match ? String(match.id) : (users[0] ? String(users[0].id) : null);
  } catch {
    return null;
  }
}

// sevDesk invoiceType mapping
const INVOICE_TYPE_MAP = {
  advance_invoice: 'AN',
  partial_invoice: 'RE',
  final_invoice:   'RE',
  correction:      'SR',
  credit_note:     'SR',
};

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
    const { billing_instruction_id, set_status_invoice_created = false } = body;
    if (!billing_instruction_id) return Response.json({ error: 'billing_instruction_id required' }, { status: 400 });

    // 1. Abrechnungsanweisung laden
    const instructions = await base44.asServiceRole.entities.BillingInstruction.filter({ id: billing_instruction_id });
    const instr = instructions?.[0];
    if (!instr) return Response.json({ error: 'BillingInstruction not found' }, { status: 404 });

    // 2. Kontakt-ID + Order-ID aus verknüpftem ConfirmedOrder
    let sevdeskContactId = null;
    let sevdeskOrderId = null;

    if (instr.confirmed_order_id) {
      const orders = await base44.asServiceRole.entities.ConfirmedOrder.filter({ id: instr.confirmed_order_id });
      const order = orders?.[0];
      if (order?.sevdesk_contact_id) sevdeskContactId = order.sevdesk_contact_id;
      if (order?.sevdesk_order_id) sevdeskOrderId = order.sevdesk_order_id;
    }

    // 3. Fallback: Kontakt per Name suchen
    if (!sevdeskContactId && instr.customer_name) {
      const searchName = encodeURIComponent(instr.customer_name.substring(0, 40));
      const contactData = await sevdeskGet(`/Contact?name=${searchName}&limit=5&depth=0`, apiKey);
      const contacts = contactData.objects || [];
      if (contacts.length > 0) sevdeskContactId = String(contacts[0].id);
    }

    if (!sevdeskContactId) {
      return Response.json({
        error: 'Kein sevDesk-Kontakt gefunden. Bitte die Auftragsbestätigung zuerst aus sevDesk importieren, damit die Kundennummer verknüpft wird.',
        customer_name: instr.customer_name
      }, { status: 422 });
    }

    // 4. Kontaktperson (SevUser) dynamisch nach PM-Name suchen
    const pmName = instr.requested_by_pm || '';
    const contactPersonId = await findSevUserId(pmName, apiKey);

    // 5. Texte aufbauen
    const invoiceTypeLabel = INVOICE_TYPE_HEADER[instr.invoice_type] || 'Teilrechnung';
    const projectLabel = instr.project_name || '';
    const vatRate = instr.vat_rate ?? 20;
    const amountNet = instr.instruction_amount_net ?? 0;
    const additionalPct = instr.additional_billing_percent > 0 ? ` (${Math.round(instr.additional_billing_percent)}%)` : '';

    // Header: "Teilrechnung: Projektname (20%)"
    const headerText = `${invoiceTypeLabel}${projectLabel ? ': ' + projectLabel : ''}${additionalPct}`;

    // Positionstext: Abrechnungsgrund oder Fallback
    const positionText = instr.invoice_reason || `${invoiceTypeLabel} gemäß Auftragsbestätigung${additionalPct}.`;

    // Fußzeile: invoice_instruction_text oder Standard
    const footText = instr.invoice_instruction_text
      || `Bei Fragen zu dieser Rechnung stehen wir Ihnen gerne zur Verfügung.`;

    // Kopfzeile
    const headText = `Sehr geehrte Damen und Herren,\n\nbeiliegend erhalten Sie unsere ${invoiceTypeLabel}${projectLabel ? ' für das Projekt „' + projectLabel + '"' : ''}${additionalPct}.`;

    // 6. Datum (Zahlungsziel 14 Tage)
    const todayDate = new Date().toISOString().split('T')[0];
    const todayForSevdesk = todayDate + ' 00:00:00';

    // 7. Rechnungsentwurf anlegen via Factory
    const invoicePayload = {
      objectName: 'Invoice',
      mapAll: true,
      contact: { id: sevdeskContactId, objectName: 'Contact' },
      ...(contactPersonId ? { contactPerson: { id: contactPersonId, objectName: 'SevUser' } } : {}),
      invoiceDate: todayForSevdesk,
      header: headerText,
      headText: headText,
      footText: footText,
      timeToPay: '14',
      invoiceType: INVOICE_TYPE_MAP[instr.invoice_type] || 'RE',
      status: '100', // Entwurf
      taxRate: String(vatRate),
      taxText: `${vatRate}% MwSt.`,
      taxType: 'default',
      currency: 'EUR',
      showNet: '1',
      ...(sevdeskOrderId ? { origin: { id: sevdeskOrderId, objectName: 'Order' } } : {}),
    };

    const invoiceResult = await sevdeskPost('/Invoice/Factory/saveInvoice', apiKey, {
      invoice: invoicePayload,
      invoicePosSave: [
        {
          objectName: 'InvoicePos',
          mapAll: true,
          part: null,
          quantity: '1',
          price: String(amountNet),
          name: headerText,
          text: positionText,
          unity: { id: '1', objectName: 'Unity' },
          taxRate: String(vatRate),
        }
      ],
      invoicePosDelete: null,
      discountSave: null,
      discountDelete: null,
    });

    const createdInvoice = invoiceResult?.objects?.invoice || invoiceResult?.invoice;
    const sevdeskInvoiceId = createdInvoice?.id ? String(createdInvoice.id) : null;
    const sevdeskUrl = sevdeskInvoiceId ? `https://my.sevdesk.de/#/fi/${sevdeskInvoiceId}` : null;

    // 8. sevDesk-IDs speichern. Status nur auf invoice_created setzen wenn explizit angefordert.
    if (sevdeskInvoiceId) {
      const updateData = {
        sevdesk_invoice_id: sevdeskInvoiceId,
        sevdesk_invoice_url: sevdeskUrl,
      };
      if (set_status_invoice_created) {
        updateData.status = 'invoice_created';
        updateData.invoice_created_at = new Date().toISOString();
      }
      await base44.asServiceRole.entities.BillingInstruction.update(billing_instruction_id, updateData);
    }

    return Response.json({
      success: true,
      sevdesk_invoice_id: sevdeskInvoiceId,
      sevdesk_url: sevdeskUrl,
      contact_person_id: contactPersonId,
      message: `Rechnungsentwurf erfolgreich in sevDesk angelegt (ID: ${sevdeskInvoiceId})`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});