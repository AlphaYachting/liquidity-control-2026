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

// 200 = versendet/offen, 750 = teilweise bezahlt, 1000 = bezahlt — paginiert
async function fetchAllByStatus(status: number, apiKey: string) {
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

function mapInvoices(invoices: any[]) {
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
      paid_amount: Math.max(0, grossAmount - openAmount),
      payment_status: openAmount <= 0.01
        ? 'paid'
        : parseAmount(inv.paidAmount) > 0 ? 'partially_paid' : 'open',
    };
  });
}

// Nur offene Forderungen — Wahrheitsquelle für die Forderungs-KPIs.
export async function fetchLiveOpenReceivables(apiKey: string) {
  const [raw200, raw750] = await Promise.all([
    fetchAllByStatus(200, apiKey),
    fetchAllByStatus(750, apiKey),
  ]);
  const invoices = [...raw200, ...raw750].filter(inv => inv.invoiceType !== 'GS');
  return mapInvoices(invoices).filter(inv => inv.open_amount > 0);
}

// Alle festgeschriebenen Rechnungen inklusive bereits bezahlter — für den
// Masseverwalter-Bericht, damit bezahlte Rechnungen als bezahlt erkennbar sind.
export async function fetchLiveReceivablesWithPaid(apiKey: string) {
  const [raw200, raw750, raw1000] = await Promise.all([
    fetchAllByStatus(200, apiKey),
    fetchAllByStatus(750, apiKey),
    fetchAllByStatus(1000, apiKey),
  ]);
  const invoices = [...raw200, ...raw750, ...raw1000].filter(inv => inv.invoiceType !== 'GS');
  return mapInvoices(invoices);
}