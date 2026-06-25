/**
 * forecastEngine.js
 * Dynamischer Forecast-Horizont: aktueller Monat + 11 Monate
 *
 * Datenquellen (Priorität / Doppelzähl-Schutz):
 *  1. InvoiceRecord       → bereits gestellte, noch offene Rechnungen
 *  2. BillingInstruction  → geplante/freigegebene Abrechnungen (noch nicht fakturiert)
 *  3. ConfirmedOrder      → offener Restbetrag (Auftrag – Rechnungen – Billing-Anweisungen)
 *  4. RecurringContract   → monatliche/quartalsweise Verträge
 *  5. Receivable          → manuelle Forderungsliste (nur wenn NICHT als InvoiceRecord vorhanden)
 *  6. LiquidityPlanLine   → manuelle Planzeilen
 *  7. ToolCost            → Abflüsse Software-Tools
 *  8. Payable             → Eingangsrechnungen / offene Verbindlichkeiten
 */

import { MONTHS_2026, weightedAmount } from './liquidityUtils';

const FORECAST_MONTHS = MONTHS_2026;
const CURRENT_MONTH = FORECAST_MONTHS[0];

const _now = new Date();
const TODAY = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Gibt YYYY-MM zurück; vergangene Monate → CURRENT_MONTH; außerhalb Horizont → null.
 */
const toForecastMonth = (dateStr) => {
  if (!dateStr) return null;
  const m = dateStr.slice(0, 7);
  if (m < CURRENT_MONTH) return CURRENT_MONTH;
  if (FORECAST_MONTHS.includes(m)) return m;
  return null;
};

const monthIdx = (m) => FORECAST_MONTHS.indexOf(m);

// ─── 1. InvoiceRecord (echte offene Rechnungen aus sevDesk) ─────────────────

export function buildInvoiceRecordItems(invoiceRecords, receivables, scenario) {
  const items = [];
  const warnings = [];

  // Rechnungsnummern die bereits als Receivable erfasst → Doppelzählung vermeiden
  const receivableInvNums = new Set(
    receivables.filter(r => r.invoice_number).map(r => r.invoice_number.trim().toLowerCase())
  );

  invoiceRecords.forEach((inv) => {
    if (inv.payment_status === 'paid' || inv.payment_status === 'cancelled') return;
    if (inv.is_credit_note) return;
    // Entwürfe (draft) nur im best_case
    if (inv.payment_status === 'draft' && scenario !== 'best_case') return;

    const invNum = inv.invoice_number ? inv.invoice_number.trim().toLowerCase() : null;
    if (invNum && receivableInvNums.has(invNum)) return;

    const amount = Number(inv.open_amount) > 0 ? Number(inv.open_amount) : Number(inv.net_amount) || 0;
    if (amount <= 0) return;

    const risk = inv.payment_status === 'overdue' ? 'high'
               : inv.payment_status === 'partially_paid' ? 'medium' : 'low';

    if (scenario === 'conservative' && risk !== 'low') return;

    const probMap = { low: 90, medium: 75, high: 50 };
    const prob = probMap[risk] || 80;

    const month = toForecastMonth(inv.due_date) || toForecastMonth(inv.invoice_date) || CURRENT_MONTH;
    const isOverdue = inv.due_date && inv.due_date < TODAY;

    if (!inv.due_date && !inv.invoice_date) {
      warnings.push({ source_type: 'invoice_record', id: inv.id, title: `${inv.customer_name} ${inv.invoice_number || ''}`, issue: 'Kein Fälligkeitsdatum' });
    }

    items.push({
      source_type: 'invoice_record',
      source_id: inv.id,
      title: [inv.invoice_number, inv.customer_name].filter(Boolean).join(' – '),
      customer_or_supplier: inv.customer_name || '—',
      category: 'invoice',
      month,
      direction: 'inflow',
      amount,
      weighted_amount: weightedAmount(amount, prob),
      probability_percent: prob,
      status: isOverdue ? 'overdue' : (inv.payment_status || 'open'),
      notes: inv.notes || (isOverdue ? `Überfällig seit ${inv.due_date}` : ''),
    });
  });

  return { items, warnings };
}

// ─── 2. BillingInstruction (geplante Abrechnungen, noch nicht fakturiert) ───

/**
 * Status-Logik:
 *  draft                → nur best_case
 *  ready_for_backoffice → realistisch + best_case (80-90% Wahrscheinlichkeit)
 *  sent_to_backoffice   → alle Szenarien (90-95%), Rechnung kommt sicher
 *  invoice_created      → Rechnung existiert → bereits als InvoiceRecord erfasst, hier NICHT nochmal
 *  paid / cancelled     → ignorieren
 */
export function buildBillingInstructionItems(billingInstructions, invoiceRecords, scenario) {
  const items = [];
  const warnings = [];

  // InvoiceRecords die aus BillingInstructions erzeugt wurden → Doppelzählung vermeiden
  const invoicedInstructionIds = new Set(
    invoiceRecords
      .filter(inv => inv.payment_status !== 'cancelled')
      .map(inv => inv.billing_block_id)
      .filter(Boolean)
  );
  // Auch über sevdesk_invoice_id abgleichen
  const instructionsWithInvoice = new Set(
    billingInstructions
      .filter(bi => bi.sevdesk_invoice_id || bi.linked_invoice_id || bi.status === 'invoice_created' || bi.status === 'paid')
      .map(bi => bi.id)
  );

  billingInstructions.forEach((bi) => {
    if (bi.status === 'paid' || bi.status === 'cancelled') return;
    // Wenn bereits Rechnung erstellt → die InvoiceRecord zählt, nicht nochmal die BillingInstruction
    if (bi.status === 'invoice_created') return;
    if (instructionsWithInvoice.has(bi.id)) return;
    if (invoicedInstructionIds.has(bi.billing_block_id)) return;

    if (bi.status === 'draft' && scenario !== 'best_case') return;
    if (bi.status === 'ready_for_backoffice' && scenario === 'conservative') return;

    const probMap = {
      draft: 50,
      ready_for_backoffice: 80,
      sent_to_backoffice: 92,
    };
    const prob = probMap[bi.status] || 70;

    const amount = Number(bi.instruction_amount_net) || 0;
    if (amount <= 0) {
      warnings.push({ source_type: 'billing_instruction', id: bi.id, title: `${bi.project_name || bi.customer_name}`, issue: 'Kein Betrag in Abrechnungsanweisung' });
      return;
    }

    const month = toForecastMonth(bi.planned_invoice_date) || CURRENT_MONTH;

    items.push({
      source_type: 'billing_instruction',
      source_id: bi.id,
      title: [bi.customer_name, bi.project_name].filter(Boolean).join(' – '),
      customer_or_supplier: bi.customer_name || '—',
      category: 'billing_instruction',
      month,
      direction: 'inflow',
      amount,
      weighted_amount: weightedAmount(amount, prob),
      probability_percent: prob,
      status: bi.status || 'draft',
      notes: bi.invoice_reason || bi.backoffice_note || '',
    });
  });

  return { items, warnings };
}

// ─── 3. ConfirmedOrder offener Restbetrag ────────────────────────────────────

/**
 * Offener Restbetrag = Auftragssumme – bereits fakturierte Beträge (InvoiceRecord) – geplante Beträge (BillingInstruction)
 * Nur für aktive, nicht vollständig abgerechnete Aufträge.
 */
export function buildOpenOrderItems(orders, invoiceRecords, billingInstructions, projects, scenario) {
  const items = [];
  const warnings = [];

  // Bereits fakturierte Nettobeträge pro ConfirmedOrder
  const invoicedByOrderId = {};
  invoiceRecords.forEach(inv => {
    if (!inv.confirmed_order_id) return;
    if (inv.payment_status === 'cancelled' || inv.is_credit_note) return;
    invoicedByOrderId[inv.confirmed_order_id] = (invoicedByOrderId[inv.confirmed_order_id] || 0) + (Number(inv.net_amount) || 0);
  });

  // Bereits als BillingInstruction geplante Beträge pro ConfirmedOrder
  const billedByOrderId = {};
  billingInstructions.forEach(bi => {
    if (!bi.confirmed_order_id) return;
    if (bi.status === 'cancelled' || bi.status === 'paid' || bi.status === 'invoice_created') return;
    if (bi.status === 'draft' && scenario !== 'best_case') return;
    billedByOrderId[bi.confirmed_order_id] = (billedByOrderId[bi.confirmed_order_id] || 0) + (Number(bi.instruction_amount_net) || 0);
  });

  const projectById = {};
  projects.forEach(p => { projectById[p.id] = p; });

  orders.forEach((o) => {
    if (o.status === 'cancelled' || o.status === 'completed') return;

    const totalNet = Number(o.total_net_amount) || 0;
    if (totalNet <= 0) return;

    const invoiced = invoicedByOrderId[o.id] || 0;
    const billedPending = billedByOrderId[o.id] || 0;
    const openNet = totalNet - invoiced - billedPending;

    // Wenn der verbleibende Rest < 5% des Auftrags oder < 500€ → vollständig geplant, überspringen
    if (openNet <= Math.max(500, totalNet * 0.05)) return;

    const proj = o.project_id ? projectById[o.project_id] : null;
    const expectedMonth = proj?.expected_invoice_date?.slice(0, 7) || proj?.expected_invoice_month || null;
    const month = toForecastMonth(expectedMonth) || CURRENT_MONTH;

    // Hohe Unsicherheit: noch komplett ungeplant
    const prob = scenario === 'best_case' ? 60 : scenario === 'conservative' ? 25 : 40;

    const title = [o.customer, o.project_name].filter(Boolean).join(' – ');

    items.push({
      source_type: 'open_order',
      source_id: o.id,
      title,
      customer_or_supplier: o.customer || '—',
      category: 'open_order',
      month,
      direction: 'inflow',
      amount: openNet,
      weighted_amount: weightedAmount(openNet, prob),
      probability_percent: prob,
      status: 'planned',
      notes: expectedMonth ? `Erwartet: ${expectedMonth}` : 'Kein Zielmonat — ungeplanter Restbetrag',
    });

    if (!expectedMonth) {
      warnings.push({ source_type: 'open_order', id: o.id, title, issue: 'Kein Erwartungsmonat im Projekt — ungeplanter Restbetrag im aktuellen Monat' });
    }
  });

  return { items, warnings };
}

// ─── 4. Recurring Contracts ──────────────────────────────────────────────────

export function buildContractItems(contracts, scenario) {
  const items = [];
  const warnings = [];

  contracts.forEach((c) => {
    const isActive = c.status === 'active' || c.status === 'pending';
    const isUnclear = c.status === 'unclear' || c.status === 'paused';
    if (!isActive && !isUnclear) return;
    if (isUnclear && scenario === 'conservative') return;

    const prob = isUnclear ? 60 : 90;
    const title = [c.customer, c.project_name].filter(Boolean).join(' – ');
    const interval = c.billing_interval || 'monthly';

    const rawStart = c.start_date ? c.start_date.slice(0, 7) : CURRENT_MONTH;
    const startMonth = rawStart < CURRENT_MONTH ? CURRENT_MONTH : rawStart;
    const startIndex = Math.max(monthIdx(startMonth), 0);
    if (startIndex < 0) return;

    const rawEnd = c.due_date ? c.due_date.slice(0, 7) : FORECAST_MONTHS[11];
    const endMonth = rawEnd > FORECAST_MONTHS[11] ? FORECAST_MONTHS[11] : rawEnd;
    const endIndex = Math.min(monthIdx(endMonth), 11);
    if (endIndex < 0 || endIndex < startIndex) return;

    if (interval === 'monthly' && Number(c.monthly_fixed_price) > 0) {
      for (let i = startIndex; i <= endIndex; i++) {
        items.push({
          source_type: 'recurring_contract', source_id: c.id, title,
          customer_or_supplier: c.customer || '—', category: c.contract_type || 'other',
          month: FORECAST_MONTHS[i], direction: 'inflow',
          amount: Number(c.monthly_fixed_price),
          weighted_amount: weightedAmount(c.monthly_fixed_price, prob),
          probability_percent: prob, status: isUnclear ? 'uncertain' : 'planned', notes: c.notes || '',
        });
      }
    } else if (interval === 'quarterly' && (Number(c.monthly_fixed_price) > 0 || Number(c.annual_amount) > 0)) {
      const quarterlyAmount = Number(c.monthly_fixed_price) > 0
        ? Number(c.monthly_fixed_price) * 3
        : Number(c.annual_amount) / 4;
      for (let i = startIndex; i <= endIndex; i += 3) {
        items.push({
          source_type: 'recurring_contract', source_id: c.id, title,
          customer_or_supplier: c.customer || '—', category: c.contract_type || 'other',
          month: FORECAST_MONTHS[i], direction: 'inflow',
          amount: quarterlyAmount, weighted_amount: weightedAmount(quarterlyAmount, prob),
          probability_percent: prob, status: isUnclear ? 'uncertain' : 'planned', notes: c.notes || '',
        });
      }
    } else if (interval === 'yearly' || interval === 'once') {
      const amount = Number(c.annual_amount) || Number(c.one_time_payment) || 0;
      if (amount === 0) { warnings.push({ source_type: 'recurring_contract', id: c.id, title, issue: 'Kein Betrag für yearly/once Vertrag' }); return; }
      const billMonth = toForecastMonth(c.due_date) || toForecastMonth(c.start_date);
      if (!billMonth) return;
      items.push({
        source_type: 'recurring_contract', source_id: c.id, title,
        customer_or_supplier: c.customer || '—', category: c.contract_type || 'other',
        month: billMonth, direction: 'inflow', amount,
        weighted_amount: weightedAmount(amount, prob),
        probability_percent: prob, status: isUnclear ? 'uncertain' : 'planned', notes: c.notes || '',
      });
    } else if (interval === 'by_effort') {
      warnings.push({ source_type: 'recurring_contract', id: c.id, title, issue: 'Abrechnung nach Aufwand – kein Fixbetrag planbar' });
    } else if (!c.monthly_fixed_price || c.monthly_fixed_price === 0) {
      warnings.push({ source_type: 'recurring_contract', id: c.id, title, issue: 'Kein monatlicher Fixpreis angegeben' });
    }

    if (Number(c.one_time_payment) > 0 && interval !== 'once') {
      const billMonth = toForecastMonth(c.start_date);
      if (billMonth) {
        items.push({
          source_type: 'recurring_contract', source_id: c.id, title: title + ' (Einmalig)',
          customer_or_supplier: c.customer || '—', category: c.contract_type || 'other',
          month: billMonth, direction: 'inflow', amount: Number(c.one_time_payment),
          weighted_amount: weightedAmount(c.one_time_payment, prob),
          probability_percent: prob, status: 'planned', notes: 'Einmalzahlung',
        });
      }
    }
  });

  return { items, warnings };
}

// ─── 5. Receivables (manuelle Forderungen, nicht als InvoiceRecord) ──────────

export function buildReceivableItems(receivables, invoiceRecords, scenario) {
  const items = [];
  const warnings = [];

  // InvoiceRecord-Nummern → Receivables die bereits als InvoiceRecord vorhanden sind, überspringen
  const knownInvNums = new Set(
    invoiceRecords.filter(i => i.invoice_number).map(i => i.invoice_number.trim().toLowerCase())
  );

  receivables.forEach((r) => {
    if (r.status === 'paid' || r.status === 'write_off' || r.status === 'cancelled') return;

    // Überspringen wenn bereits als InvoiceRecord vorhanden
    const rNum = r.invoice_number ? r.invoice_number.trim().toLowerCase() : null;
    if (rNum && knownInvNums.has(rNum)) return;

    const risk = r.collection_risk || 'low';
    if (scenario === 'conservative' && risk !== 'low') return;
    if (scenario === 'realistic' && (risk === 'high' || risk === 'critical')) return;

    const probMap = { low: 90, medium: 70, high: 40, critical: 20, unclear: 50 };
    const prob = probMap[risk] || 70;
    const amount = Number(r.net_amount) || Number(r.gross_amount) || 0;

    if (!r.due_date) {
      warnings.push({ source_type: 'receivable', id: r.id, title: `${r.customer} ${r.invoice_number || ''}`, issue: 'Kein Fälligkeitsdatum' });
    }

    const month = toForecastMonth(r.due_date) || CURRENT_MONTH;
    const isOverdue = r.due_date && r.due_date < TODAY;

    items.push({
      source_type: 'receivable', source_id: r.id,
      title: [r.customer, r.invoice_number].filter(Boolean).join(' / '),
      customer_or_supplier: r.customer || '—', category: 'receivable',
      month, direction: 'inflow', amount,
      weighted_amount: weightedAmount(amount, prob),
      probability_percent: prob, status: isOverdue ? 'overdue' : (r.status || 'open'),
      notes: r.remarks || (isOverdue ? `Überfällig seit ${r.due_date}` : ''),
    });
  });

  return { items, warnings };
}

// ─── 6. Plan Lines ───────────────────────────────────────────────────────────

export function buildPlanLineItems(planLines, scenario) {
  const items = [];
  const warnings = [];

  planLines.forEach((l) => {
    if (l.status === 'cancelled' || l.status === 'paid') return;
    if (l.status === 'uncertain' && scenario === 'conservative') return;

    const month = toForecastMonth(l.month) || toForecastMonth(l.payment_due_date) || toForecastMonth(l.date);
    if (!month) {
      if (l.month || l.payment_due_date || l.date) return;
      warnings.push({ source_type: 'plan_line', id: l.id, title: l.title, issue: 'Kein Monat zugeordnet' });
      return;
    }

    const prob = Number(l.probability_percent) || 100;
    const amount = Number(l.amount_net) || 0;

    items.push({
      source_type: 'plan_line', source_id: l.id, title: l.title || '—',
      customer_or_supplier: l.customer_or_supplier || '—', category: l.parent_type || 'manual',
      month, direction: l.direction, amount,
      weighted_amount: weightedAmount(amount, prob),
      probability_percent: prob, status: l.status || 'planned', notes: l.notes || '',
    });
  });

  return { items, warnings };
}

// ─── 7. Tool Costs ───────────────────────────────────────────────────────────

export function buildToolCostItems(tools, scenario) {
  const items = [];
  const warnings = [];

  tools.forEach((t) => {
    const shouldCancel = t.decision_status === 'cancel' || t.needed === false;
    if (shouldCancel && scenario !== 'best_case') return;
    if (t.payment_status === 'paid') return;

    const interval = t.payment_interval || 'monthly';
    const title = t.tool_name || '—';

    if (interval === 'monthly' && Number(t.monthly_cost) > 0) {
      FORECAST_MONTHS.forEach((month) => {
        items.push({
          source_type: 'tool_cost', source_id: t.id, title,
          customer_or_supplier: t.department || '—', category: t.department || 'other',
          month, direction: 'outflow', amount: Number(t.monthly_cost),
          weighted_amount: Number(t.monthly_cost), probability_percent: 100, status: 'planned',
          notes: t.info || (t.customer_recharge ? `Weiterverr.: ${t.customer_recharge}` : ''),
        });
      });
    } else if (interval === 'quarterly' && (Number(t.monthly_cost) > 0 || Number(t.annual_cost) > 0)) {
      const quarterlyAmount = Number(t.monthly_cost) > 0 ? Number(t.monthly_cost) * 3 : Number(t.annual_cost) / 4;
      [0, 3, 6, 9].forEach((offset) => {
        if (offset < FORECAST_MONTHS.length) {
          items.push({
            source_type: 'tool_cost', source_id: t.id, title,
            customer_or_supplier: t.department || '—', category: t.department || 'other',
            month: FORECAST_MONTHS[offset], direction: 'outflow', amount: quarterlyAmount,
            weighted_amount: quarterlyAmount, probability_percent: 100, status: 'planned', notes: t.info || '',
          });
        }
      });
    } else if (interval === 'yearly' || interval === 'one_time') {
      const amount = Number(t.annual_cost) || Number(t.monthly_cost) * 12 || 0;
      if (amount === 0) { warnings.push({ source_type: 'tool_cost', id: t.id, title, issue: 'Kein Betrag für jährliches Tool' }); return; }
      const billMonth = toForecastMonth(t.due_date);
      if (!billMonth) return;
      items.push({
        source_type: 'tool_cost', source_id: t.id, title,
        customer_or_supplier: t.department || '—', category: t.department || 'other',
        month: billMonth, direction: 'outflow', amount, weighted_amount: amount,
        probability_percent: 100, status: 'planned', notes: t.info || '',
      });
    } else if (interval === 'unclear' && Number(t.annual_cost) > 0) {
      const monthly = Number(t.annual_cost) / 12;
      FORECAST_MONTHS.forEach((month) => {
        items.push({
          source_type: 'tool_cost', source_id: t.id, title,
          customer_or_supplier: t.department || '—', category: t.department || 'other',
          month, direction: 'outflow', amount: monthly, weighted_amount: monthly,
          probability_percent: 100, status: 'uncertain', notes: 'Intervall unklar – verteilt auf 12 Monate',
        });
      });
      warnings.push({ source_type: 'tool_cost', id: t.id, title, issue: 'Zahlungsintervall unklar – auf Monate verteilt' });
    }
  });

  return { items, warnings };
}

// ─── 8. Payables ─────────────────────────────────────────────────────────────

export function buildPayableItems(payables, scenario) {
  const items = [];
  const warnings = [];

  payables.forEach((p) => {
    if (p.status === 'paid' || p.status === 'cancelled') return;
    const priority = p.priority || 'normal';
    if (priority === 'defer_possible' && scenario === 'conservative') return;

    const probMap = { critical: 100, normal: 100, defer_possible: 80, unclear: 70, disputed: 50 };
    const prob = probMap[priority] || 100;
    const amount = Number(p.gross_amount) || Number(p.net_amount) || 0;
    const month = toForecastMonth(p.payment_planned_date) || toForecastMonth(p.due_date) || CURRENT_MONTH;

    if (!p.payment_planned_date && !p.due_date) {
      warnings.push({ source_type: 'payable', id: p.id, title: `${p.supplier} ${p.invoice_number || ''}`, issue: 'Kein Zahlungsdatum' });
    }

    items.push({
      source_type: 'payable', source_id: p.id,
      title: [p.supplier, p.invoice_number].filter(Boolean).join(' / '),
      customer_or_supplier: p.supplier || '—', category: 'payable',
      month, direction: 'outflow', amount,
      weighted_amount: weightedAmount(amount, prob),
      probability_percent: prob, status: p.status || 'open',
      notes: p.unclear_notes || p.description || '',
    });
  });

  return { items, warnings };
}

// ─── Main Engine ─────────────────────────────────────────────────────────────

export function buildFullForecast({
  planLines = [],
  contracts = [],
  tools = [],
  receivables = [],
  payables = [],
  invoiceRecords = [],
  billingInstructions = [],
  orders = [],
  projects = [],
  scenario = 'realistic',
  openingBalance = 0,
  fixedMonthlyCosts = 0,
  taxObligations = 0,
}) {
  const allItems = [];
  const allWarnings = [];

  const push = (result) => {
    allItems.push(...result.items);
    allWarnings.push(...result.warnings);
  };

  // Priorität: InvoiceRecord → BillingInstruction → OpenOrder (Rest) → alles andere
  push(buildInvoiceRecordItems(invoiceRecords, receivables, scenario));
  push(buildBillingInstructionItems(billingInstructions, invoiceRecords, scenario));
  push(buildOpenOrderItems(orders, invoiceRecords, billingInstructions, projects, scenario));
  push(buildContractItems(contracts, scenario));
  push(buildReceivableItems(receivables, invoiceRecords, scenario));
  push(buildPlanLineItems(planLines, scenario));
  push(buildToolCostItems(tools, scenario));
  push(buildPayableItems(payables, scenario));

  const sourceSummary = {
    invoice_records: allItems.filter(i => i.source_type === 'invoice_record').length,
    billing_instructions: allItems.filter(i => i.source_type === 'billing_instruction').length,
    open_orders: allItems.filter(i => i.source_type === 'open_order').length,
    recurring_contracts: allItems.filter(i => i.source_type === 'recurring_contract').length,
    receivables: allItems.filter(i => i.source_type === 'receivable').length,
    plan_lines: allItems.filter(i => i.source_type === 'plan_line').length,
    tool_costs: allItems.filter(i => i.source_type === 'tool_cost').length,
    payables: allItems.filter(i => i.source_type === 'payable').length,
  };

  let balance = openingBalance;

  const months = FORECAST_MONTHS.map((month) => {
    const monthItems = allItems.filter((i) => i.month === month);
    const inflow_items = monthItems.filter((i) => i.direction === 'inflow');
    const outflow_items = monthItems.filter((i) => i.direction === 'outflow');

    const inflow = inflow_items.reduce((s, i) => s + i.amount, 0);
    const weighted_inflow = inflow_items.reduce((s, i) => s + i.weighted_amount, 0);

    const fixedCosts = Number(fixedMonthlyCosts) || 0;
    const taxObl = Number(taxObligations) || 0;

    const fixedItems = [];
    if (fixedCosts > 0) fixedItems.push({
      source_type: 'plan_line', source_id: 'fixed_costs', title: 'Fixkosten (Gehälter etc.)',
      customer_or_supplier: '—', category: 'manual', month, direction: 'outflow',
      amount: fixedCosts, weighted_amount: fixedCosts, probability_percent: 100, status: 'planned', notes: 'Manueller Parameter',
    });
    if (taxObl > 0) fixedItems.push({
      source_type: 'plan_line', source_id: 'tax_obligations', title: 'Steuer / SV-Pflichten',
      customer_or_supplier: '—', category: 'manual', month, direction: 'outflow',
      amount: taxObl, weighted_amount: taxObl, probability_percent: 100, status: 'planned', notes: 'Manueller Parameter',
    });

    const all_outflow_items = [...outflow_items, ...fixedItems];
    const outflow = all_outflow_items.reduce((s, i) => s + i.amount, 0);
    const weighted_outflow = all_outflow_items.reduce((s, i) => s + i.weighted_amount, 0);

    const net_cashflow = inflow - outflow;
    const weighted_net = weighted_inflow - weighted_outflow;
    balance += weighted_net;

    const sourceBreakdown = {
      invoice_records_in: inflow_items.filter(i => i.source_type === 'invoice_record').reduce((s, i) => s + i.weighted_amount, 0),
      billing_instructions_in: inflow_items.filter(i => i.source_type === 'billing_instruction').reduce((s, i) => s + i.weighted_amount, 0),
      open_orders_in: inflow_items.filter(i => i.source_type === 'open_order').reduce((s, i) => s + i.weighted_amount, 0),
      contracts_in: inflow_items.filter(i => i.source_type === 'recurring_contract').reduce((s, i) => s + i.weighted_amount, 0),
      receivables_in: inflow_items.filter(i => i.source_type === 'receivable').reduce((s, i) => s + i.weighted_amount, 0),
      plan_lines_in: inflow_items.filter(i => i.source_type === 'plan_line').reduce((s, i) => s + i.weighted_amount, 0),
      tool_costs_out: all_outflow_items.filter(i => i.source_type === 'tool_cost').reduce((s, i) => s + i.weighted_amount, 0),
      payables_out: all_outflow_items.filter(i => i.source_type === 'payable').reduce((s, i) => s + i.weighted_amount, 0),
      plan_lines_out: all_outflow_items.filter(i => i.source_type === 'plan_line').reduce((s, i) => s + i.weighted_amount, 0),
    };

    const risk_flags = [];
    if (weighted_net < 0) risk_flags.push('Liquiditätslücke');
    if (inflow_items.some(i => i.status === 'overdue')) risk_flags.push('Überfällige Forderungen');
    if (inflow_items.some(i => i.status === 'uncertain')) risk_flags.push('Unsichere Zuflüsse');

    return {
      month,
      inflows: inflow,
      weighted_inflow,
      outflows: outflow,
      weighted_outflow,
      net_cashflow,
      weighted_net_cashflow: weighted_net,
      closing: balance,
      gap: balance < 0 ? balance : 0,
      inflow_items,
      outflow_items: all_outflow_items,
      source_breakdown: sourceBreakdown,
      risk_flags,
    };
  });

  return { months, warnings: allWarnings, sourceSummary };
}