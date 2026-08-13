/**
 * planSuggestions.js — erzeugt CashflowPlanItem-Entwürfe aus Systemdaten.
 *
 * Kaskade wie in forecastEngine.js, ohne Doppelzählung:
 *  1. InvoiceRecord      — offene, versendete, nicht stornierte Rechnungen (brutto)
 *  2. BillingInstruction — freigegeben, noch nicht fakturiert (netto → brutto)
 *  3. ConfirmedOrder     — nicht fakturierter Auftragsrest (netto → brutto);
 *                          Aufträge OHNE Zieldatum entfallen NICHT, sondern
 *                          werden ohne invoice_date erzeugt und markiert
 *  4. RecurringContract  — aktive Verträge im Planhorizont
 *
 * regie_support hat bewusst keine automatische Quelle.
 */

import { isLiquidityRelevantInvoice } from '@/lib/invoiceLiquidityFilter';
import { netToGross } from './cashflowPlan';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const addDays = (dateStr, days) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

// ─── 1. InvoiceRecord ────────────────────────────────────────────────────────
function fromInvoices(invoices, cutoff, vatRate) {
  const out = [];
  invoices.forEach((inv) => {
    if (!isLiquidityRelevantInvoice(inv)) return;
    if (inv.payment_status === 'paid') return;
    const amount = Number(inv.open_amount) > 0
      ? Number(inv.open_amount)
      : Number(inv.gross_amount) || Number(inv.net_amount) || 0;
    if (amount <= 0) return;

    const isAlt = cutoff && inv.invoice_date && inv.invoice_date < cutoff;
    out.push({
      direction: 'inflow',
      category: 'alt_debitoren',
      label: [inv.invoice_number, inv.customer_name].filter(Boolean).join(' – ') || 'Rechnung',
      customer_or_supplier: inv.customer_name || '',
      claim_type: isAlt ? 'alt' : 'gemischt',
      amount_gross: round2(amount),
      amount_alt_gross: isAlt ? round2(amount) : 0,
      amount_neu_gross: 0,
      vat_rate: vatRate,
      invoice_date: inv.invoice_date || null,
      source_type: 'invoice',
      source_id: inv.id,
      needs_split_review: !isAlt,
      derivation: isAlt
        ? `Offener Betrag brutto ${round2(amount).toFixed(2)} € aus Rechnung ${inv.invoice_number || inv.id}; Rechnungsdatum vor dem Stichtag → Altforderung.`
        : `Offener Betrag brutto ${round2(amount).toFixed(2)} € aus Rechnung ${inv.invoice_number || inv.id}; Rechnungsdatum am oder nach dem Stichtag → Alt/Neu-Aufteilung nach Leistungszeitraum prüfen.`,
    });
  });
  return out;
}

// ─── 2. BillingInstruction ───────────────────────────────────────────────────
function fromBillingInstructions(instructions, defaultVat) {
  const out = [];
  instructions.forEach((bi) => {
    if (['draft', 'paid', 'cancelled', 'blocked', 'invoice_created'].includes(bi.status)) return;
    if (bi.sevdesk_invoice_id || bi.linked_invoice_id) return;
    const net = Number(bi.instruction_amount_net) || 0;
    if (net <= 0) return;
    const vat = Number(bi.vat_rate) > 0 ? Number(bi.vat_rate) : defaultVat;
    const gross = netToGross(net, vat);

    out.push({
      direction: 'inflow',
      category: 'uebergangs_fakturierung',
      label: [bi.customer_name, bi.project_name].filter(Boolean).join(' – ') || 'Abrechnungsanweisung',
      customer_or_supplier: bi.customer_name || '',
      claim_type: 'gemischt',
      amount_gross: gross,
      amount_alt_gross: 0,
      amount_neu_gross: gross,
      vat_rate: vat,
      invoice_date: bi.planned_invoice_date || null,
      source_type: 'billing_instruction',
      source_id: bi.id,
      needs_split_review: true,
      derivation: `Freigegebene Abrechnung ${net.toFixed(2)} € netto × (1 + ${vat}%) = ${gross.toFixed(2)} € brutto. Alt/Neu-Aufteilung nach Leistungszeitraum prüfen.`,
    });
  });
  return out;
}

// ─── 3. ConfirmedOrder ───────────────────────────────────────────────────────
function fromOrders(orders, invoices, instructions, projects, defaultVat) {
  const out = [];

  const invoicedGrossByOrder = {};
  invoices.forEach((inv) => {
    if (!inv.confirmed_order_id || inv.is_credit_note || inv.payment_status === 'cancelled') return;
    invoicedGrossByOrder[inv.confirmed_order_id] =
      (invoicedGrossByOrder[inv.confirmed_order_id] || 0) + (Number(inv.gross_amount) || Number(inv.net_amount) || 0);
  });

  const plannedNetByOrder = {};
  instructions.forEach((bi) => {
    if (!bi.confirmed_order_id || ['cancelled', 'paid', 'invoice_created'].includes(bi.status)) return;
    if (bi.sevdesk_invoice_id) return;
    plannedNetByOrder[bi.confirmed_order_id] =
      (plannedNetByOrder[bi.confirmed_order_id] || 0) + (Number(bi.instruction_amount_net) || 0);
  });

  const projectById = {};
  projects.forEach((p) => { projectById[p.id] = p; });

  orders.forEach((o) => {
    if (['cancelled', 'completed'].includes(o.status)) return;
    const totalNet = Number(o.total_net_amount) || 0;
    if (totalNet <= 0) return;

    const vat = defaultVat;
    const invoicedNet = (invoicedGrossByOrder[o.id] || 0) / (1 + vat / 100);
    const openNet = totalNet - invoicedNet - (plannedNetByOrder[o.id] || 0);
    if (openNet < 500) return;

    const proj = o.project_id ? projectById[o.project_id] : null;
    const expectedDate = proj?.expected_invoice_date
      || (proj?.expected_invoice_month ? `${proj.expected_invoice_month}-15` : null);
    const gross = netToGross(openNet, vat);

    out.push({
      direction: 'inflow',
      category: 'projekt_neuleistung',
      label: [o.customer, o.project_name].filter(Boolean).join(' – ') || 'Auftragsrest',
      customer_or_supplier: o.customer || '',
      claim_type: 'neu',
      amount_gross: gross,
      amount_alt_gross: 0,
      amount_neu_gross: gross,
      vat_rate: vat,
      invoice_date: expectedDate || null,
      source_type: 'order',
      source_id: o.id,
      needs_split_review: false,
      derivation: `Auftragsrest: ${totalNet.toFixed(2)} € Auftrag netto − ${invoicedNet.toFixed(2)} € fakturiert − ${(plannedNetByOrder[o.id] || 0).toFixed(2)} € bereits angewiesen = ${openNet.toFixed(2)} € netto × (1 + ${vat}%) = ${gross.toFixed(2)} € brutto.`
        + (expectedDate ? '' : ' Kein Zieldatum im Projekt hinterlegt — Termin muss ergänzt werden.'),
    });
  });

  return out;
}

// ─── 4. RecurringContract ────────────────────────────────────────────────────
function fromContracts(contracts, planStart, planEnd, defaultVat) {
  const out = [];
  const catFor = (t) => (t === 'online_marketing' ? 'online_marketing' : 'wartungsvertrag');

  contracts.forEach((c) => {
    if (c.status !== 'active') return;
    const interval = c.billing_interval || 'monthly';
    const vat = defaultVat;
    const label = [c.customer, c.project_name].filter(Boolean).join(' – ') || 'Vertrag';

    const push = (net, date, note) => {
      const gross = netToGross(net, vat);
      out.push({
        direction: 'inflow',
        category: catFor(c.contract_type),
        label,
        customer_or_supplier: c.customer || '',
        claim_type: 'neu',
        amount_gross: gross,
        amount_alt_gross: 0,
        amount_neu_gross: gross,
        vat_rate: vat,
        invoice_date: date,
        source_type: 'contract',
        source_id: `${c.id}:${date}`,
        needs_split_review: false,
        derivation: `${note} ${net.toFixed(2)} € netto × (1 + ${vat}%) = ${gross.toFixed(2)} € brutto.`,
      });
    };

    if (interval === 'monthly') {
      const net = Number(c.monthly_fixed_price) || 0;
      if (net <= 0) return;
      const d = new Date(planStart);
      while (d.toISOString().slice(0, 10) <= planEnd) {
        const date = d.toISOString().slice(0, 10);
        if (!c.due_date || date <= c.due_date) push(net, date, `Monatlicher Vertrag, Fälligkeit ${date}:`);
        d.setMonth(d.getMonth() + 1);
      }
    } else if (['yearly', 'once'].includes(interval)) {
      const net = Number(c.annual_amount) || Number(c.one_time_payment) || 0;
      const date = c.due_date || c.start_date;
      // Jahresverträge nur, wenn die Verlängerung in den Planhorizont fällt
      if (net > 0 && date && date >= planStart && date <= planEnd) {
        push(net, date, `Jahresvertrag, Verlängerung ${date}:`);
      }
    }
  });

  return out;
}

/**
 * Erzeugt Vorschläge und filtert bereits vorhandene Positionen (source_type + source_id).
 */
export function buildPlanSuggestions({
  plan, existingItems = [], invoices = [], instructions = [], orders = [],
  projects = [], contracts = [], defaultVatRate = 20,
}) {
  const planStart = plan.plan_start_date || new Date().toISOString().slice(0, 10);
  const planEnd = addDays(planStart, (Number(plan.weeks) || 13) * 7 - 1);
  const cutoff = plan.cutoff_date || null;

  const all = [
    ...fromInvoices(invoices, cutoff, defaultVatRate),
    ...fromBillingInstructions(instructions, defaultVatRate),
    ...fromOrders(orders, invoices, instructions, projects, defaultVatRate),
    ...fromContracts(contracts, planStart, planEnd, defaultVatRate),
  ];

  const known = new Set(existingItems.map((i) => `${i.source_type}|${i.source_id}`));
  const fresh = all.filter((i) => !known.has(`${i.source_type}|${i.source_id}`));

  const bySource = (t) => fresh.filter((i) => i.source_type === t).length;
  const summary = {
    total: fresh.length,
    skipped: all.length - fresh.length,
    invoice: bySource('invoice'),
    billing_instruction: bySource('billing_instruction'),
    order: bySource('order'),
    contract: bySource('contract'),
    needs_split_review: fresh.filter((i) => i.needs_split_review).length,
    missing_date: fresh.filter((i) => !i.invoice_date).length,
  };

  return { suggestions: fresh.map((i) => ({ ...i, plan_id: plan.id, is_draft: true })), summary };
}