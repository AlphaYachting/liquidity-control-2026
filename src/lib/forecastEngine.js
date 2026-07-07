/**
 * forecastEngine.js — Liquiditäts-Forecast ab aktuellem Monat, 12 Monate
 *
 * Quellen (in Priorität, ohne Doppelzählung):
 *  1. InvoiceRecord        — offene, echte Rechnungen (aus sevDesk)
 *  2. BillingInstruction   — freigegebene/übermittelte Abrechnungen (noch nicht fakturiert)
 *  3. ConfirmedOrder       — ungeplanter Restbetrag (Auftrag – Rechnungen – Anweisungen)
 *  4. RecurringContract    — laufende Wartungs-/Retainer-Verträge
 *  5. LiquidityPlanLine    — manuelle Planzeilen
 *  6. ToolCost             — Abflüsse Softwarekosten
 *  7. Payable              — offene Eingangsrechnungen
 *
 * Grundprinzip:
 *  - Nur Gegenwart + Zukunft. Vergangene Fälligkeiten werden auf den HEUTIGEN Monat gesetzt.
 *  - Keine Schätzungen aus der Luft — nur was in den Entities steht.
 *  - open_amount (Brutto) für Rechnungen, instruction_amount_net für BillingInstructions.
 */

import { MONTHS_2026, weightedAmount } from './liquidityUtils';
import { isLiquidityRelevantInvoice } from './invoiceLiquidityFilter';

// MONTHS_2026 = [aktueller Monat, ..., +11 Monate] (dynamisch aus liquidityUtils)
const FORECAST_MONTHS = MONTHS_2026;
const CURRENT_MONTH = FORECAST_MONTHS[0]; // z.B. "2026-06"

const _d = new Date();
const TODAY = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

/** YYYY-MM aus einem Datums-String, clipped auf Forecast-Horizont */
const toMonth = (dateStr) => {
  if (!dateStr) return null;
  const m = String(dateStr).slice(0, 7);
  if (m < CURRENT_MONTH) return CURRENT_MONTH; // Vergangenheit → aktueller Monat
  if (FORECAST_MONTHS.includes(m)) return m;
  return null; // nach dem 12-Monats-Horizont
};

/** Wahrscheinlichkeit je Szenario und Risikolevel */
const scenarioProb = (scenario, risk = 'low') => {
  const map = {
    conservative: { low: 85, medium: 55, high: 25 },
    realistic:    { low: 90, medium: 70, high: 45 },
    best_case:    { low: 95, medium: 85, high: 65 },
  };
  return (map[scenario] || map.realistic)[risk] ?? 70;
};

// ─── 1. InvoiceRecord (offene echte Rechnungen) ───────────────────────────────

function buildInvoiceItems(invoiceRecords, scenario) {
  const items = [];

  invoiceRecords.forEach(inv => {
    // Nur versendete, nicht stornierte Rechnungen (keine Entwürfe, keine Gutschriften)
    if (!isLiquidityRelevantInvoice(inv)) return;
    if (inv.payment_status === 'paid') return; // bereits bezahlt → kein offener Zufluss mehr

    const amount = Number(inv.open_amount) > 0 ? Number(inv.open_amount) : Number(inv.gross_amount) || Number(inv.net_amount) || 0;
    if (amount <= 0) return;

    const isOverdue = inv.due_date && inv.due_date < TODAY;
    const risk = inv.payment_status === 'overdue' || isOverdue ? 'high'
               : inv.payment_status === 'partially_paid' ? 'medium' : 'low';

    if (scenario === 'conservative' && risk === 'high') return;

    const prob = scenarioProb(scenario, risk);
    const month = toMonth(inv.due_date) || toMonth(inv.invoice_date) || CURRENT_MONTH;

    items.push({
      source_type: 'invoice_record',
      source_id: inv.id,
      title: [inv.invoice_number, inv.customer_name].filter(Boolean).join(' – '),
      customer_or_supplier: inv.customer_name || '—',
      month,
      direction: 'inflow',
      amount,
      weighted_amount: weightedAmount(amount, prob),
      probability_percent: prob,
      status: isOverdue ? 'overdue' : (inv.payment_status || 'open'),
      notes: inv.notes || (isOverdue ? `Überfällig seit ${inv.due_date}` : ''),
    });
  });

  return items;
}

// ─── 2. BillingInstruction (freigegebene/übermittelte Abrechnungen) ───────────

function buildBillingInstructionItems(billingInstructions, invoiceRecordIds, scenario) {
  const items = [];

  billingInstructions.forEach(bi => {
    if (['paid', 'cancelled', 'invoice_created'].includes(bi.status)) return;
    // Wenn bereits eine Rechnung verknüpft → die InvoiceRecord zählt
    if (bi.linked_invoice_id && invoiceRecordIds.has(bi.linked_invoice_id)) return;
    if (bi.sevdesk_invoice_id) return; // Rechnung bereits erstellt

    if (bi.status === 'draft' && scenario !== 'best_case') return;
    if (bi.status === 'ready_for_backoffice' && scenario === 'conservative') return;

    const amount = Number(bi.instruction_amount_net) || 0;
    if (amount <= 0) return;

    const probMap = { draft: 50, ready_for_backoffice: 75, sent_to_backoffice: 90 };
    const prob = probMap[bi.status] || 70;
    const month = toMonth(bi.planned_invoice_date) || CURRENT_MONTH;

    items.push({
      source_type: 'billing_instruction',
      source_id: bi.id,
      title: [bi.customer_name, bi.project_name].filter(Boolean).join(' – '),
      customer_or_supplier: bi.customer_name || '—',
      month,
      direction: 'inflow',
      amount,
      weighted_amount: weightedAmount(amount, prob),
      probability_percent: prob,
      status: bi.status,
      notes: bi.invoice_reason || '',
    });
  });

  return items;
}

// ─── 3. ConfirmedOrder (ungeplanter Restbetrag) ───────────────────────────────

function buildOpenOrderItems(orders, invoiceRecords, billingInstructions, projects, scenario) {
  const items = [];

  // Bereits fakturiert (Brutto) pro Auftrag
  const invoicedByOrder = {};
  invoiceRecords.forEach(inv => {
    if (!inv.confirmed_order_id || ['cancelled'].includes(inv.payment_status) || inv.is_credit_note) return;
    invoicedByOrder[inv.confirmed_order_id] = (invoicedByOrder[inv.confirmed_order_id] || 0) + (Number(inv.gross_amount) || Number(inv.net_amount) || 0);
  });

  // Bereits in Billing-Anweisungen geplant (Netto) pro Auftrag
  const billedByOrder = {};
  billingInstructions.forEach(bi => {
    if (!bi.confirmed_order_id || ['cancelled', 'paid', 'invoice_created'].includes(bi.status)) return;
    if (bi.sevdesk_invoice_id) return;
    billedByOrder[bi.confirmed_order_id] = (billedByOrder[bi.confirmed_order_id] || 0) + (Number(bi.instruction_amount_net) || 0);
  });

  const projectById = {};
  projects.forEach(p => { projectById[p.id] = p; });

  orders.forEach(o => {
    if (['cancelled', 'completed'].includes(o.status)) return;
    const total = Number(o.total_net_amount) || 0;
    if (total <= 0) return;

    const invoiced = invoicedByOrder[o.id] || 0;
    const planned = billedByOrder[o.id] || 0;
    // Restbetrag (Netto) = Auftrag – bereits fakturiert (rough) – bereits geplant
    const openNet = total - (invoiced / 1.2) - planned; // Brutto → Netto mit 20% MwSt-Faktor

    // Nur wenn wesentlicher Restbetrag
    if (openNet < 500) return;

    const proj = o.project_id ? projectById[o.project_id] : null;
    const expectedMonth = proj?.expected_invoice_date?.slice(0,7) || proj?.expected_invoice_month || null;

    // Kein Zieldatum = nicht planbar → nicht in den Forecast
    if (!expectedMonth) return;

    const month = toMonth(expectedMonth);
    if (!month) return; // außerhalb des 12-Monats-Horizonts

    // Ungeplante Auftragsreste haben höhere Unsicherheit
    const probMap = { best_case: 55, realistic: 35, conservative: 20 };
    const prob = probMap[scenario] || 35;

    items.push({
      source_type: 'open_order',
      source_id: o.id,
      title: [o.customer, o.project_name].filter(Boolean).join(' – '),
      customer_or_supplier: o.customer || '—',
      month,
      direction: 'inflow',
      amount: openNet,
      weighted_amount: weightedAmount(openNet, prob),
      probability_percent: prob,
      status: 'planned',
      notes: expectedMonth ? `Erwartet: ${expectedMonth}` : 'Kein Zielmonat gesetzt',
    });
  });

  return items;
}

// ─── 4. RecurringContract ────────────────────────────────────────────────────

function buildContractItems(contracts, scenario) {
  const items = [];

  contracts.forEach(c => {
    if (!['active', 'pending'].includes(c.status)) return;
    if (c.status === 'paused' && scenario === 'conservative') return;

    const interval = c.billing_interval || 'monthly';
    const title = [c.customer, c.project_name].filter(Boolean).join(' – ');
    const prob = 88;

    const rawStart = c.start_date ? c.start_date.slice(0,7) : CURRENT_MONTH;
    const startIdx = Math.max(FORECAST_MONTHS.indexOf(rawStart < CURRENT_MONTH ? CURRENT_MONTH : rawStart), 0);
    const rawEnd = c.due_date ? c.due_date.slice(0,7) : FORECAST_MONTHS[11];
    const endIdx = Math.min(FORECAST_MONTHS.indexOf(rawEnd > FORECAST_MONTHS[11] ? FORECAST_MONTHS[11] : rawEnd), 11);
    if (endIdx < 0 || endIdx < startIdx) return;

    if (interval === 'monthly' && Number(c.monthly_fixed_price) > 0) {
      for (let i = startIdx; i <= endIdx; i++) {
        items.push({
          source_type: 'recurring_contract', source_id: c.id, title,
          customer_or_supplier: c.customer || '—', month: FORECAST_MONTHS[i],
          direction: 'inflow', amount: Number(c.monthly_fixed_price),
          weighted_amount: weightedAmount(c.monthly_fixed_price, prob),
          probability_percent: prob, status: 'planned', notes: c.notes || '',
        });
      }
    } else if (interval === 'quarterly') {
      const amt = Number(c.monthly_fixed_price) > 0 ? Number(c.monthly_fixed_price) * 3 : Number(c.annual_amount) / 4;
      if (amt > 0) {
        for (let i = startIdx; i <= endIdx; i += 3) {
          items.push({
            source_type: 'recurring_contract', source_id: c.id, title,
            customer_or_supplier: c.customer || '—', month: FORECAST_MONTHS[i],
            direction: 'inflow', amount: amt, weighted_amount: weightedAmount(amt, prob),
            probability_percent: prob, status: 'planned', notes: c.notes || '',
          });
        }
      }
    } else if (['yearly', 'once'].includes(interval)) {
      const amt = Number(c.annual_amount) || Number(c.one_time_payment) || 0;
      const billMonth = toMonth(c.due_date) || toMonth(c.start_date);
      if (amt > 0 && billMonth) {
        items.push({
          source_type: 'recurring_contract', source_id: c.id, title,
          customer_or_supplier: c.customer || '—', month: billMonth,
          direction: 'inflow', amount: amt, weighted_amount: weightedAmount(amt, prob),
          probability_percent: prob, status: 'planned', notes: c.notes || '',
        });
      }
    }
  });

  return items;
}

// ─── 5. LiquidityPlanLine ────────────────────────────────────────────────────

function buildPlanLineItems(planLines, scenario) {
  const items = [];

  planLines.forEach(l => {
    if (['cancelled', 'paid'].includes(l.status)) return;
    if (l.status === 'uncertain' && scenario === 'conservative') return;

    const month = toMonth(l.month) || toMonth(l.payment_due_date) || toMonth(l.date);
    if (!month) return;

    const prob = Number(l.probability_percent) || 100;
    const amount = Number(l.amount_net) || 0;
    if (amount <= 0) return;

    items.push({
      source_type: 'plan_line', source_id: l.id, title: l.title || '—',
      customer_or_supplier: l.customer_or_supplier || '—', month,
      direction: l.direction, amount,
      weighted_amount: weightedAmount(amount, prob),
      probability_percent: prob, status: l.status || 'planned', notes: l.notes || '',
    });
  });

  return items;
}

// ─── 6. ToolCost ─────────────────────────────────────────────────────────────

function buildToolCostItems(tools, scenario) {
  const items = [];

  tools.forEach(t => {
    if (t.decision_status === 'cancel' || t.needed === false) return; // stornierte Tools raus
    if (t.payment_status === 'paid') return;

    const interval = t.payment_interval || 'monthly';
    const title = t.tool_name || '—';

    if (interval === 'monthly' && Number(t.monthly_cost) > 0) {
      FORECAST_MONTHS.forEach(month => {
        items.push({
          source_type: 'tool_cost', source_id: t.id, title,
          customer_or_supplier: t.department || '—', month,
          direction: 'outflow', amount: Number(t.monthly_cost),
          weighted_amount: Number(t.monthly_cost),
          probability_percent: 100, status: 'planned', notes: t.info || '',
        });
      });
    } else if (interval === 'quarterly') {
      const amt = Number(t.monthly_cost) > 0 ? Number(t.monthly_cost) * 3 : Number(t.annual_cost) / 4;
      if (amt > 0) {
        [0, 3, 6, 9].filter(o => o < FORECAST_MONTHS.length).forEach(o => {
          items.push({
            source_type: 'tool_cost', source_id: t.id, title,
            customer_or_supplier: t.department || '—', month: FORECAST_MONTHS[o],
            direction: 'outflow', amount: amt, weighted_amount: amt,
            probability_percent: 100, status: 'planned', notes: t.info || '',
          });
        });
      }
    } else if (['yearly', 'one_time'].includes(interval)) {
      const amt = Number(t.annual_cost) || 0;
      const billMonth = toMonth(t.due_date);
      if (amt > 0 && billMonth) {
        items.push({
          source_type: 'tool_cost', source_id: t.id, title,
          customer_or_supplier: t.department || '—', month: billMonth,
          direction: 'outflow', amount: amt, weighted_amount: amt,
          probability_percent: 100, status: 'planned', notes: t.info || '',
        });
      }
    }
  });

  return items;
}

// ─── 7. Payable ──────────────────────────────────────────────────────────────

function buildPayableItems(payables, scenario) {
  const items = [];

  payables.forEach(p => {
    if (['paid', 'cancelled'].includes(p.status)) return;
    if (p.priority === 'defer_possible' && scenario === 'conservative') return;

    const prob = p.priority === 'disputed' ? 60 : 100;
    const amount = Number(p.gross_amount) || Number(p.net_amount) || 0;
    if (amount <= 0) return;
    const month = toMonth(p.payment_planned_date) || toMonth(p.due_date) || CURRENT_MONTH;

    items.push({
      source_type: 'payable', source_id: p.id,
      title: [p.supplier, p.invoice_number].filter(Boolean).join(' / '),
      customer_or_supplier: p.supplier || '—', month,
      direction: 'outflow', amount,
      weighted_amount: weightedAmount(amount, prob),
      probability_percent: prob, status: p.status || 'open',
      notes: p.description || '',
    });
  });

  return items;
}

// ─── Main: buildFullForecast ─────────────────────────────────────────────────

export function buildFullForecast({
  planLines = [], contracts = [], tools = [], receivables = [], payables = [],
  invoiceRecords = [], billingInstructions = [], orders = [], projects = [],
  scenario = 'realistic', openingBalance = 0, fixedMonthlyCosts = 0, taxObligations = 0,
}) {
  const invoiceRecordIds = new Set(invoiceRecords.map(i => i.id));

  const allItems = [
    ...buildInvoiceItems(invoiceRecords, scenario),
    ...buildBillingInstructionItems(billingInstructions, invoiceRecordIds, scenario),
    ...buildOpenOrderItems(orders, invoiceRecords, billingInstructions, projects, scenario),
    ...buildContractItems(contracts, scenario),
    ...buildPlanLineItems(planLines, scenario),
    ...buildToolCostItems(tools, scenario),
    ...buildPayableItems(payables, scenario),
  ];

  const sourceSummary = {
    invoice_records:       allItems.filter(i => i.source_type === 'invoice_record').length,
    billing_instructions:  allItems.filter(i => i.source_type === 'billing_instruction').length,
    open_orders:           allItems.filter(i => i.source_type === 'open_order').length,
    recurring_contracts:   allItems.filter(i => i.source_type === 'recurring_contract').length,
    plan_lines:            allItems.filter(i => i.source_type === 'plan_line').length,
    tool_costs:            allItems.filter(i => i.source_type === 'tool_cost').length,
    payables:              allItems.filter(i => i.source_type === 'payable').length,
  };

  let balance = Number(openingBalance) || 0;
  const fixedCosts = Number(fixedMonthlyCosts) || 0;
  const taxObl = Number(taxObligations) || 0;

  const months = FORECAST_MONTHS.map(month => {
    const monthItems = allItems.filter(i => i.month === month);
    const inflow_items = monthItems.filter(i => i.direction === 'inflow');
    const outflow_items = monthItems.filter(i => i.direction === 'outflow');

    // Fixkosten als sichtbare Items im DrillDown
    const fixedItems = [];
    if (fixedCosts > 0) fixedItems.push({
      source_type: 'plan_line', source_id: 'fixed_costs', title: 'Fixkosten (Gehälter etc.)',
      customer_or_supplier: '—', month, direction: 'outflow',
      amount: fixedCosts, weighted_amount: fixedCosts, probability_percent: 100, status: 'planned',
    });
    if (taxObl > 0) fixedItems.push({
      source_type: 'plan_line', source_id: 'tax', title: 'Steuer / SV-Pflichten',
      customer_or_supplier: '—', month, direction: 'outflow',
      amount: taxObl, weighted_amount: taxObl, probability_percent: 100, status: 'planned',
    });

    const all_outflow = [...outflow_items, ...fixedItems];

    const weighted_inflow  = inflow_items.reduce((s, i) => s + i.weighted_amount, 0);
    const weighted_outflow = all_outflow.reduce((s, i) => s + i.weighted_amount, 0);
    const inflow           = inflow_items.reduce((s, i) => s + i.amount, 0);
    const outflow          = all_outflow.reduce((s, i) => s + i.amount, 0);

    const weighted_net = weighted_inflow - weighted_outflow;
    balance += weighted_net;

    const source_breakdown = {
      invoice_records_in:      inflow_items.filter(i => i.source_type === 'invoice_record').reduce((s,i) => s+i.weighted_amount, 0),
      billing_instructions_in: inflow_items.filter(i => i.source_type === 'billing_instruction').reduce((s,i) => s+i.weighted_amount, 0),
      open_orders_in:          inflow_items.filter(i => i.source_type === 'open_order').reduce((s,i) => s+i.weighted_amount, 0),
      contracts_in:            inflow_items.filter(i => i.source_type === 'recurring_contract').reduce((s,i) => s+i.weighted_amount, 0),
      plan_lines_in:           inflow_items.filter(i => i.source_type === 'plan_line').reduce((s,i) => s+i.weighted_amount, 0),
      tool_costs_out:          all_outflow.filter(i => i.source_type === 'tool_cost').reduce((s,i) => s+i.weighted_amount, 0),
      payables_out:            all_outflow.filter(i => i.source_type === 'payable').reduce((s,i) => s+i.weighted_amount, 0),
      plan_lines_out:          all_outflow.filter(i => i.source_type === 'plan_line').reduce((s,i) => s+i.weighted_amount, 0),
    };

    const risk_flags = [];
    if (weighted_net < 0) risk_flags.push('Liquiditätslücke');
    if (inflow_items.some(i => i.status === 'overdue')) risk_flags.push('Überfällige Forderungen');

    return {
      month,
      inflows: inflow,
      weighted_inflow,
      outflows: outflow,
      weighted_outflow,
      net_cashflow: inflow - outflow,
      weighted_net_cashflow: weighted_net,
      closing: balance,
      gap: balance < 0 ? balance : 0,
      inflow_items,
      outflow_items: all_outflow,
      source_breakdown,
      risk_flags,
    };
  });

  const warnings = [];
  return { months, warnings, sourceSummary };
}