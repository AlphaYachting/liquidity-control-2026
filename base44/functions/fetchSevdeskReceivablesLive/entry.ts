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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ error: 'SEVDESK_API_KEY not set' }, { status: 500 });

    // Nur offene/überfällige Rechnungen — status 100 = Entwurf, 200 = geliefert, 300 = Teilzahlung
    // Wir holen alle und filtern auf nicht-bezahlt (status != 1000) und nicht-storniert (status != 50)
    const data = await sevdeskGet(
      `/Invoice?limit=500&offset=0&embed=contact&orderBy=payDate&orderDirection=asc`,
      apiKey
    );

    const invoices = (data.objects || []).filter(inv => {
      const status = inv.status;
      // 100 = Entwurf, 50 = storniert/deaktiviert, 1000 = bezahlt — alle ausschließen
      // GS = Gutschrift (Credit Note) wird separat behandelt, nicht als offene Forderung
      if (status === '1000' || status === '50' || status === '100') return false;
      if (inv.invoiceType === 'GS') return false; // Gutschriften ausschließen
      return true;
    });

    const result = invoices.map(inv => {
      const grossAmount = parseAmount(inv.sumGross);
      const paidAmount = parseAmount(inv.sumGrossPay || '0');
      const openAmount = Math.max(0, grossAmount - paidAmount);

      // due_date = invoiceDate + timeToPay (Zahlungsziel), nicht payDate (= tatsächliches Zahlungsdatum)
      let dueDate = null;
      if (inv.invoiceDate) {
        const timeToPay = parseInt(inv.timeToPay || inv.discountTime || '30', 10);
        const days = isNaN(timeToPay) || timeToPay <= 0 ? 30 : timeToPay;
        const d = new Date(inv.invoiceDate.substring(0, 10));
        d.setDate(d.getDate() + days);
        dueDate = d.toISOString().substring(0, 10);
      }

      return {
        id: String(inv.id),
        invoice_number: inv.invoiceNumber || '',
        invoice_date: inv.invoiceDate ? inv.invoiceDate.substring(0, 10) : null,
        due_date: dueDate,
        customer_name: inv.contact?.name || inv.contactName || '',
        gross_amount: grossAmount,
        open_amount: openAmount,
        payment_status: paidAmount > 0 ? 'partially_paid' : 'open',
        source: 'sevdesk_live',
      };
    }).filter(inv => inv.open_amount > 0);

    const totalOpen = result.reduce((s, i) => s + i.open_amount, 0);

    return Response.json({
      success: true,
      count: result.length,
      total_open_gross: Math.round(totalOpen * 100) / 100,
      invoices: result,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});