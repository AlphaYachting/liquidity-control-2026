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

// Storno-Rechnungen (SR) und Gutschriften (GS) fliegen raus — und mit einer
// Storno-Rechnung auch die von ihr stornierte Originalrechnung (Feld origin).
function ohneStornos(invoices: any[]) {
  const stornierteOriginale = new Set<string>();
  for (const inv of invoices) {
    if (inv.invoiceType === 'SR' && inv.origin?.id) stornierteOriginale.add(String(inv.origin.id));
  }
  return invoices.filter(inv =>
    inv.invoiceType !== 'GS' &&
    inv.invoiceType !== 'SR' &&
    !stornierteOriginale.has(String(inv.id))
  );
}

function mapInvoices(invoices: any[]) {
  return invoices.map(inv => {
    const grossAmount = parseAmount(inv.sumGross);
    const netAmount = parseAmount(inv.sumNet);
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
      net_amount: netAmount,
      // Netto-Anteile des offenen bzw. bezahlten Betrags — anteilig zum Bruttobetrag
      open_net: grossAmount > 0 ? Math.round((openAmount / grossAmount) * netAmount * 100) / 100 : 0,
      paid_net: grossAmount > 0 ? Math.round(((grossAmount - openAmount) / grossAmount) * netAmount * 100) / 100 : 0,
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
  // Status 1000 wird mitgeladen, weil Storno-Rechnungen dort liegen und ihre
  // Originalrechnung sonst weiter als offen erscheinen würde.
  const [raw200, raw750, raw1000] = await Promise.all([
    fetchAllByStatus(200, apiKey),
    fetchAllByStatus(750, apiKey),
    fetchAllByStatus(1000, apiKey),
  ]);
  raw750.push(...raw1000.filter((inv: any) => inv.invoiceType === 'SR'));
  const invoices = ohneStornos([...raw200, ...raw750]);
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
  const invoices = ohneStornos([...raw200, ...raw750, ...raw1000]);
  return mapInvoices(invoices);
}