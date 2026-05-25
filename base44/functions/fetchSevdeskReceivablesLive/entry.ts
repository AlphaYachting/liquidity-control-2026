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

    // sevDesk Status-Codes:
    // 100 = Entwurf, 200 = Versendet/offen, 750 = Teilweise bezahlt, 1000 = Vollständig bezahlt, 50 = Storniert
    // Wir holen Status 200 (offen) und 750 (teilw. bezahlt) — paginiert um alle zu erfassen
    async function fetchAllByStatus(status) {
      const all = [];
      let offset = 0;
      const pageSize = 100;
      while (true) {
        const page = await sevdeskGet(
          `/Invoice?limit=${pageSize}&offset=${offset}&embed=contact&status=${status}`,
          apiKey
        );
        const items = page.objects || [];
        all.push(...items);
        if (items.length < pageSize) break;
        offset += pageSize;
      }
      return all;
    }

    const [raw200, raw750] = await Promise.all([
      fetchAllByStatus(200),
      fetchAllByStatus(750),
    ]);

    const allRaw = [...raw200, ...raw750];

    const invoices = allRaw.filter(inv => {
      if (inv.invoiceType === 'GS') return false; // Gutschriften ausschließen
      return true;
    });

    // Nur 2026er Rechnungen (Rechnungsdatum ab 01.01.2026)
    const invoices2026 = invoices.filter(inv => {
      const dateStr = inv.invoiceDate ? inv.invoiceDate.substring(0, 10) : '';
      return dateStr >= '2026-01-01';
    });

    const result = invoices2026.map(inv => {
      const grossAmount = parseAmount(inv.sumGross);
      // sumOpenAmount = das von sevDesk berechnete offene Restfeld (identisch mit "offener Betrag" im Export)
      // Fallback auf sumGross - paidAmount wenn sumOpenAmount nicht vorhanden
      const openAmount = parseAmount(inv.sumOpenAmount) > 0
        ? parseAmount(inv.sumOpenAmount)
        : Math.max(0, grossAmount - parseAmount(inv.paidAmount));

      // Fälligkeitsdatum: invoiceDate + timeToPay Tage (Zahlungsziel lt. Rechnung)
      let dueDate = null;
      if (inv.invoiceDate) {
        const timeToPay = parseInt(inv.timeToPay || '30', 10);
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
        payment_status: parseAmount(inv.paidAmount) > 0 ? 'partially_paid' : 'open',
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