// sevDesk-Rechnung → InvoiceRecord. Unverändert aus syncSevdeskInvoices herausgelöst,
// damit der 6-Stunden-Lauf und der Live-Abgleich exakt dieselbe Abbildung verwenden.

export const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';

export async function sevdeskGet(path, apiKey) {
  const res = await fetch(`${SEVDESK_BASE}${path}`, {
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`sevDesk API error ${res.status}: ${await res.text()}`);
  return res.json();
}

// Für Teilzahlungen: Einzelrechnung mit embed=payments abrufen
export async function fetchPaidAmount(invoiceId, grossAmount, apiKey) {
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

export function mapInvoiceStatus(invoice) {
  const status = invoice.status;
  if (status === '1000') return 'paid';
  if (status === '750') return 'partially_paid'; // sevDesk: teilweise bezahlt
  if (status === '300') return 'partially_paid'; // sevDesk: älter, ebenfalls teilbezahlt
  if (status === '50') return 'cancelled';
  if (status === '100') return 'draft';
  if (status === '200') return 'open'; // versendet, noch nicht fällig
  return 'open';
}

export function parseAmount(val) {
  return parseFloat(val || '0') || 0;
}

export function extractSevdeskIdFromNotes(notes) {
  const match = (notes || '').match(/sevDesk ID:\s*(\d+)/i);
  return match ? match[1] : null;
}

export function findMatchingOrder(invoice, confirmedOrders, ordersBySevdeskId) {
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
export function shouldSkipMatching(inv) {
  return inv.status === '100' || inv.status === '50'; // draft or cancelled
}

export function buildRecord(inv, matchResult, existing, recordIdBySevdeskId = {}, recordById = {}, ordersById = {}) {
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
  let invoiceType = inv.invoiceType === 'AN' ? 'advance_invoice' :
                      inv.invoiceType === 'SR' ? 'final_invoice' :
                      inv.invoiceType === 'TR' ? 'partial_invoice' :
                      'partial_invoice'; // RE, MA, unknown → partial

  const paymentStatus = mapInvoiceStatus(inv);

  // is_sent: sevDesk-Status 100 = Entwurf (nicht versendet), alles andere = versendet/festgeschrieben.
  // Nur versendete, nicht stornierte Rechnungen fliessen in die Liquiditaetsuebersicht.
  const isSent = inv.status !== '100';

  // Storno-/Korrektur-Erkennung:
  // sevDesk erstellt bei einer Stornierung eine Gegenrechnung mit negativem Betrag,
  // deren origin.objectName === 'Invoice' auf die Ursprungsrechnung zeigt.
  // Diese Belege sind buchhalterisch Gutschriften und müssen als solche markiert werden,
  // damit sie den Auftragsbestand nicht fälschlich als abgerechnet erscheinen lassen.
  const originIsInvoice = inv.origin?.objectName === 'Invoice';
  const isCorrection = originIsInvoice && netAmount < 0;
  const correctionOriginSevdeskId = isCorrection ? String(inv.origin?.id || '') : null;

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

  let confirmedOrderId = matchResult?.order?.id || existing?.confirmed_order_id || null;
  // Projekt wird aus dem zugeordneten Auftrag geerbt — sonst hängt die Rechnung
  // am Auftrag, erscheint aber in keinem Projekt-Cockpit.
  let projectId = existing?.project_id
    || (confirmedOrderId ? (ordersById[confirmedOrderId]?.project_id || null) : null);
  let billingBlockId = existing?.billing_block_id || null;
  const matchStatus = matchResult ? 'auto_matched' : (existing?.match_status || 'unmatched');
  const matchConfidence = matchResult?.confidence || existing?.match_confidence || 0;

  // Korrektur/Storno-Belege als Gutschrift klassifizieren und mit Ursprung verknüpfen
  let isCreditNote = false;
  let originalInvoiceId = existing?.original_invoice_id || null;
  if (isCorrection) {
    invoiceType = 'correction';
    isCreditNote = true;
    if (correctionOriginSevdeskId && recordIdBySevdeskId[correctionOriginSevdeskId]) {
      originalInvoiceId = recordIdBySevdeskId[correctionOriginSevdeskId];
    }
    // Zuordnung von der Ursprungsrechnung erben, damit die Gutschrift im selben
    // Projekt/Auftrag erscheint und den Nettoeffekt korrekt auf 0 bringt.
    const origin = originalInvoiceId ? recordById[originalInvoiceId] : null;
    if (origin) {
      confirmedOrderId = origin.confirmed_order_id || confirmedOrderId;
      projectId = origin.project_id || projectId;
      billingBlockId = origin.billing_block_id || billingBlockId;
    }
  }

  return {
    project_id: projectId,
    billing_block_id: billingBlockId,
    invoice_number: inv.invoiceNumber || '',
    invoice_date: invoiceDate,
    customer_name: inv.contact?.name || inv.contactName || '',
    invoice_type: invoiceType,
    is_credit_note: isCreditNote,
    original_invoice_id: originalInvoiceId,
    net_amount: netAmount,
    gross_amount: grossAmount,
    vat_amount: vatAmount,
    vat_rate: netAmount > 0 ? Math.round((vatAmount / netAmount) * 100) : 20,
    due_date: dueDate,
    payment_status: paymentStatus,
    paid_amount: paidAmount,
    open_amount: openAmount,
    payment_date: paymentStatus === 'paid' ? paymentDate : null,
    is_sent: isSent,
    source_type: 'sevdesk',
    sevdesk_id: String(inv.id),
    confirmed_order_id: confirmedOrderId,
    match_status: matchStatus,
    match_confidence: matchConfidence,
    notes: inv.header || '',
    source_file: JSON.stringify(inv),
  };
}

// Vorrang: Verknüpfung über die Abrechnungsanweisung (auch für Entwürfe).
// Wortgleich zum bisherigen Block im 6-Stunden-Lauf, jetzt für beide Wege.
export function mitAnweisungVerknuepfen(record, instr, existing) {
  if (!instr || existing?.match_status === 'manually_matched') return false;
  record.confirmed_order_id = instr.confirmed_order_id || record.confirmed_order_id;
  record.project_id = existing?.project_id || instr.project_id || record.project_id;
  record.match_status = 'auto_matched';
  record.match_confidence = 100;
  return true;
}

// Nur die Zahlungsfelder einer sevDesk-Rechnung — dieselbe Berechnung wie in buildRecord.
// Für das Nachziehen des Zahlstands älterer Rechnungen, ohne Zuordnung oder Beträge anzufassen.
export function zahlfelder(inv) {
  const grossAmount = parseAmount(inv.sumGross);
  const paymentStatus = mapInvoiceStatus(inv);
  const paymentDate = inv.payDate ? inv.payDate.substring(0, 10) : null;
  const rawPaidAmount = parseAmount(inv.sumGrossPay || '0');
  const paidAmount = rawPaidAmount > 0 ? rawPaidAmount :
                     (paymentStatus === 'paid' ? grossAmount : 0);
  const rawRemaining = parseAmount(inv.sumRemaining || '0');
  let openAmount;
  if (paymentStatus === 'paid') {
    openAmount = 0;
  } else if (rawRemaining > 0) {
    openAmount = rawRemaining;
  } else if (paidAmount > 0) {
    openAmount = Math.max(0, grossAmount - paidAmount);
  } else {
    openAmount = grossAmount;
  }
  return {
    payment_status: paymentStatus,
    paid_amount: paidAmount,
    open_amount: openAmount,
    payment_date: paymentStatus === 'paid' ? paymentDate : null,
    is_sent: inv.status !== '100',
  };
}
