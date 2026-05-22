import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';

async function sevdeskGet(path, apiKey) {
  const res = await fetch(`${SEVDESK_BASE}${path}`, {
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`sevDesk API error ${res.status}: ${await res.text()}`);
  return res.json();
}

function mapInvoiceStatus(invoice) {
  const status = invoice.status;
  if (status === '200') return 'open';
  if (status === '1000') return 'paid';
  if (status === '100') return 'open'; // draft
  if (status === '50') return 'cancelled';
  return 'open';
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

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const limit = body.limit || 100;
    const offset = body.offset || 0;

    // Fetch invoices from sevDesk
    const data = await sevdeskGet(
      `/Invoice?limit=${limit}&offset=${offset}&embed=contact&orderBy=invoiceDate&orderDirection=desc`,
      apiKey
    );

    const invoices = data.objects || [];
    let created = 0;
    let updated = 0;
    let failed = 0;

    for (const inv of invoices) {
      try {
        const sevdeskId = String(inv.id);
        
        // Check if already exists
        const existing = await base44.asServiceRole.entities.InvoiceRecord.filter({ sevdesk_id: sevdeskId });
        
        const invoiceDate = inv.invoiceDate ? inv.invoiceDate.substring(0, 10) : null;
        const dueDate = inv.payDate ? inv.payDate.substring(0, 10) : null;
        const paymentDate = inv.entryDate ? inv.entryDate.substring(0, 10) : null;
        
        const netAmount = parseAmount(inv.sumNet);
        const grossAmount = parseAmount(inv.sumGross);
        const vatAmount = parseAmount(inv.sumTax);
        const paidAmount = parseAmount(inv.sumGrossPay || '0');
        
        const invoiceType = inv.invoiceType === 'AN' ? 'advance_invoice' :
                            inv.invoiceType === 'RE' ? 'partial_invoice' : 'final_invoice';

        const paymentStatus = mapInvoiceStatus(inv);
        
        const record = {
          invoice_number: inv.invoiceNumber || '',
          invoice_date: invoiceDate,
          customer_name: inv.contact?.name || inv.contactName || '',
          invoice_type: invoiceType,
          net_amount: netAmount,
          gross_amount: grossAmount,
          vat_amount: vatAmount,
          vat_rate: netAmount > 0 ? Math.round((vatAmount / netAmount) * 100) : 20,
          due_date: dueDate,
          payment_status: paymentStatus,
          paid_amount: paidAmount,
          open_amount: grossAmount - paidAmount,
          payment_date: paymentStatus === 'paid' ? paymentDate : null,
          source_type: 'sevdesk',
          sevdesk_id: sevdeskId,
          match_status: 'unmatched',
          notes: inv.header || '',
        };

        if (existing && existing.length > 0) {
          await base44.asServiceRole.entities.InvoiceRecord.update(existing[0].id, record);
          updated++;
        } else {
          await base44.asServiceRole.entities.InvoiceRecord.create(record);
          created++;
        }
      } catch {
        failed++;
      }
    }

    return Response.json({
      success: true,
      fetched: invoices.length,
      created,
      updated,
      failed,
      message: `sevDesk Rechnungen synchronisiert: ${created} neu, ${updated} aktualisiert, ${failed} Fehler`
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});