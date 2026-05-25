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

    const allRaw = [...raw200, ...raw750].filter(inv => inv.invoiceType !== 'GS');

    // Gruppiere nach Jahr und zeige alle Rechnungen mit Jahr + Betrag
    const byYear = {};
    const allDetails = [];

    for (const inv of allRaw) {
      const dateStr = inv.invoiceDate ? inv.invoiceDate.substring(0, 10) : 'unknown';
      const year = dateStr.substring(0, 4);
      const gross = parseAmount(inv.sumGross);
      const openAmt = parseAmount(inv.sumOpenAmount) > 0
        ? parseAmount(inv.sumOpenAmount)
        : Math.max(0, gross - parseAmount(inv.paidAmount));

      if (openAmt <= 0) continue;

      if (!byYear[year]) byYear[year] = { count: 0, total: 0, invoices: [] };
      byYear[year].count++;
      byYear[year].total += openAmt;
      byYear[year].invoices.push({
        invoice_number: inv.invoiceNumber,
        date: dateStr,
        customer: inv.contact?.name || inv.contactName || '',
        gross,
        open_amount: Math.round(openAmt * 100) / 100,
        status: inv.status,
        invoiceType: inv.invoiceType,
      });
    }

    // Runde totals
    for (const y of Object.keys(byYear)) {
      byYear[y].total = Math.round(byYear[y].total * 100) / 100;
    }

    const grandTotal = Object.values(byYear).reduce((s, y) => s + y.total, 0);

    return Response.json({
      grand_total: Math.round(grandTotal * 100) / 100,
      by_year: byYear,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});