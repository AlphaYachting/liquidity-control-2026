// Führend ist, was in sevDesk verschickt wurde — nicht der Status einer Anweisung
// und nicht eine Rechnungsplanung. Gezählt wird ausschliesslich der festgeschriebene
// Beleg: is_sent = true, also kein Entwurf, und nicht storniert.
// Gutschriften/Korrekturen tragen einen negativen Nettobetrag und kürzen die Summe
// dadurch von selbst — genau wie in der Buchhaltung.
const COUNTS_AS_SENT = (inv) =>
  inv.is_sent === true &&
  inv.payment_status !== 'draft' &&
  inv.payment_status !== 'cancelled';

export function invoicedKpi(invoices, monthStr) {
  const sent = (invoices || []).filter(i =>
    COUNTS_AS_SENT(i) && (i.invoice_date || '').substring(0, 7) === monthStr
  );
  return {
    amount: sent.reduce((s, i) => s + (Number(i.net_amount) || 0), 0),
    count: sent.length,
  };
}

// Anweisungen, die als verrechnet gelten, ohne dass ein sevDesk-Beleg daran hängt.
// Solche Fälle behaupten Umsatz, den sevDesk nicht kennt — sie müssen sichtbar sein.
export function instructionsWithoutProof(instructions) {
  return (instructions || []).filter(i =>
    ['invoice_created', 'paid'].includes(i.status) && !i.sevdesk_invoice_id
  );
}