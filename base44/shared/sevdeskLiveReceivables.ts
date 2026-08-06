// Live-Abruf offener Forderungen aus sevDesk — identische Logik wie
// fetchSevdeskReceivablesLive (Wahrheitsquelle für Forderungs-KPIs).
const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';

async function sevdeskGet(path: string, apiKey: string) {
  const res = await fetch(`${SEVDESK_BASE}${path}`, {
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`sevDesk API error ${res.status}: ${await res.text()}`);
  return res.json();
}

const parseAmount = (val: unknown) => parseFloat(String(val || '0')) || 0;

export async function fetchLiveOpenReceivables(apiKey: string) {
  // 200 = versendet/offen, 750 = teilweise bezahlt — paginiert
  async function fetchAllByStatus(status: number) {
    const all: any[] = [];
    let offset = 0;
    const pageSize = 100;
    while (true) {
      const page = await sevdeskGet(`/Invoice?limit=${pageSize}&offset=${offset}&embed=contact&status=${status}`, apiKey);
      const items = page.objects || [];
      all.push(...items);
      if (items.length < pageSize) break;
      offset += pageSize;
    }
    return all;
  }

  const [raw200, raw750] = await Promise.all([fetchAllByStatus(200), fetchAllByStatus(750)]);
  const invoices = [...raw200, ...raw750].filter(inv => inv.invoiceType !== 'GS');

  return invoices.map(inv => {
    const grossAmount = parseAmount(inv.sumGross);
    const openAmount = parseAmount(inv.sumOpenAmount) > 0
      ? parseAmount(inv.sumOpenAmount)
      : Math.max(0, grossAmount - parseAmount(inv.paidAmount));
    let dueDate: string | null = null;
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
      customer_name: inv.contact?.name || inv.contactName || '',
      invoice_date: inv.invoiceDate ? inv.invoiceDate.substring(0, 10) : null,
      due_date: dueDate,
      gross_amount: grossAmount,
      open_amount: openAmount,
      payment_status: parseAmount(inv.paidAmount) > 0 ? 'partially_paid' : 'open',
    };
  }).filter(inv => inv.open_amount > 0);
}