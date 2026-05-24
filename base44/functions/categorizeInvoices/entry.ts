import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CATEGORIES = ['Marketing', 'Positionierung', 'Grafik & Design', 'Webdesign & Online-Marketing'];

const SYSTEM_PROMPT = `Du bist ein Experte für die Kategorisierung von Agenturleistungen.
Ordne jede Rechnung GENAU EINER der folgenden Kategorien zu:
- Marketing: allgemeine Marketingmaßnahmen, Kampagnen, Werbung, Social Media, Content
- Positionierung: Strategie, Branding, Markenentwicklung, Unternehmensberatung, Kommunikationsstrategie
- Grafik & Design: Grafikdesign, Corporate Design, Logo, Print, Illustration, Fotografie
- Webdesign & Online-Marketing: Website, Web-Entwicklung, SEO, SEA, Google Ads, Newsletter, E-Mail-Marketing, Hosting, Lizenzen, CMS

Antworte NUR mit einem validen JSON-Array. Für jede Rechnung gib id, category und confidence (0-100) zurück.`;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const forceRefresh = body.force_refresh ?? false;

    // Load all invoices
    const invoices = await base44.asServiceRole.entities.InvoiceRecord.list('-invoice_date', 500);

    if (!invoices.length) return Response.json({ categorized: [], categories: CATEGORIES });

    // Build prompt chunks of max 80 invoices per call to stay within token limits
    const chunkSize = 80;
    const allResults = [];

    for (let i = 0; i < invoices.length; i += chunkSize) {
      const chunk = invoices.slice(i, i + chunkSize);
      const invoiceList = chunk.map(inv => ({
        id: inv.id,
        customer: inv.customer_name,
        notes: inv.notes || '',
        amount: inv.net_amount,
        invoice_number: inv.invoice_number || '',
        invoice_type: inv.invoice_type || ''
      }));

      const prompt = `${SYSTEM_PROMPT}

Rechnungen (JSON):
${JSON.stringify(invoiceList, null, 2)}

Antworte NUR mit diesem JSON-Format:
[{"id": "...", "category": "...", "confidence": 90}, ...]`;

      const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  category: { type: "string" },
                  confidence: { type: "number" }
                }
              }
            }
          }
        }
      });

      const items = result?.items ?? [];
      allResults.push(...items);
    }

    // Merge categorization back with invoice data
    const invoiceMap = Object.fromEntries(invoices.map(inv => [inv.id, inv]));
    const categorized = allResults.map(r => {
      const inv = invoiceMap[r.id];
      if (!inv) return null;
      return {
        id: inv.id,
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        customer_name: inv.customer_name,
        notes: inv.notes,
        net_amount: inv.net_amount,
        gross_amount: inv.gross_amount,
        payment_status: inv.payment_status,
        category: r.category,
        confidence: r.confidence ?? 80
      };
    }).filter(Boolean);

    // Calculate totals per category per month
    const summary = {};
    for (const cat of CATEGORIES) {
      const catItems = categorized.filter(c => c.category === cat);
      summary[cat] = {
        total_net: catItems.reduce((s, c) => s + (c.net_amount || 0), 0),
        total_gross: catItems.reduce((s, c) => s + (c.gross_amount || 0), 0),
        count: catItems.length,
        invoices: catItems
      };
    }

    return Response.json({ categorized, summary, categories: CATEGORIES, total_invoices: invoices.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});