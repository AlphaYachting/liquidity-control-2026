/**
 * forecastEngine.js
 * Stage 1 — Multi-source forecast engine for Liquidity Control 2026
 *
 * Builds a complete monthly projection from:
 *  1. LiquidityPlanLine
 *  2. RecurringContract
 *  3. ToolCost
 *  4. Receivable
 *  5. Payable
 */

import { MONTHS_2026, weightedAmount } from './liquidityUtils';

// Dynamisch berechnet — kein hartkodiertes Datum
const _now = new Date();
const TODAY = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;
const CURRENT_MONTH = TODAY.slice(0, 7);

// ─── helpers ────────────────────────────────────────────────────────────────

const toMonth = (dateStr) => {
  if (!dateStr) return null;
  const d = dateStr.slice(0, 7); // YYYY-MM
  return MONTHS_2026.includes(d) ? d : null;
};

const clamp2026 = (month) => (MONTHS_2026.includes(month) ? month : null);

const monthIndex = (m) => MONTHS_2026.indexOf(m);

// ─── 1. Plan Lines ───────────────────────────────────────────────────────────

export function buildPlanLineItems(planLines, scenario) {
  const items = [];
  const warnings = [];

  planLines.forEach((l) => {
    if (l.status === 'cancelled') return;
    if (l.status === 'uncertain' && scenario === 'conservative') return;

    const month = toMonth(l.month) || toMonth(l.payment_due_date) || toMonth(l.date);
    if (!month) {
      warnings.push({ source_type: 'plan_line', id: l.id, title: l.title, issue: 'Kein Monat zugeordnet' });
      return;
    }

    const prob = Number(l.probability_percent) || 100;
    const amount = Number(l.amount_net) || 0;

    items.push({
      source_type: 'plan_line',
      source_id: l.id,
      title: l.title || '—',
      customer_or_supplier: l.customer_or_supplier || '—',
      category: l.parent_type || 'manual',
      month,
      direction: l.direction,
      amount,
      weighted_amount: weightedAmount(amount, prob),
      probability_percent: prob,
      status: l.status || 'planned',
      notes: l.notes || '',
    });
  });

  return { items, warnings };
}

// ─── 2. Recurring Contracts ──────────────────────────────────────────────────

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
    const startMonth = toMonth(c.start_date) || MONTHS_2026[0];
    const endMonth = toMonth(c.due_date) || MONTHS_2026[11];
    const startIdx = Math.max(monthIndex(startMonth), 0);
    const endIdx = Math.min(monthIndex(endMonth), 11);

    if (interval === 'monthly' && Number(c.monthly_fixed_price) > 0) {
      for (let i = startIdx; i <= endIdx; i++) {
        items.push({
          source_type: 'recurring_contract',
          source_id: c.id,
          title,
          customer_or_supplier: c.customer || '—',
          category: c.contract_type || 'other',
          month: MONTHS_2026[i],
          direction: 'inflow',
          amount: Number(c.monthly_fixed_price),
          weighted_amount: weightedAmount(c.monthly_fixed_price, prob),
          probability_percent: prob,
          status: isUnclear ? 'uncertain' : 'planned',
          notes: c.notes || '',
        });
      }
    } else if (interval === 'quarterly' && Number(c.monthly_fixed_price) > 0) {
      const quarterlyAmount = Number(c.monthly_fixed_price) * 3;
      for (let i = startIdx; i <= endIdx; i += 3) {
        items.push({
          source_type: 'recurring_contract',
          source_id: c.id,
          title,
          customer_or_supplier: c.customer || '—',
          category: c.contract_type || 'other',
          month: MONTHS_2026[i],
          direction: 'inflow',
          amount: quarterlyAmount,
          weighted_amount: weightedAmount(quarterlyAmount, prob),
          probability_percent: prob,
          status: isUnclear ? 'uncertain' : 'planned',
          notes: c.notes || '',
        });
      }
    } else if (interval === 'yearly' || interval === 'once') {
      const amount = Number(c.annual_amount) || Number(c.one_time_payment) || 0;
      if (amount === 0) {
        warnings.push({ source_type: 'recurring_contract', id: c.id, title, issue: 'Kein Betrag für yearly/once Vertrag' });
        return;
      }
      const billMonth = toMonth(c.due_date) || toMonth(c.start_date) || CURRENT_MONTH;
      if (!clamp2026(billMonth)) return;
      items.push({
        source_type: 'recurring_contract',
        source_id: c.id,
        title,
        customer_or_supplier: c.customer || '—',
        category: c.contract_type || 'other',
        month: billMonth,
        direction: 'inflow',
        amount,
        weighted_amount: weightedAmount(amount, prob),
        probability_percent: prob,
        status: isUnclear ? 'uncertain' : 'planned',
        notes: c.notes || '',
      });
    } else if (interval === 'by_effort') {
      // by_effort contracts: warn but do not project
      warnings.push({ source_type: 'recurring_contract', id: c.id, title, issue: 'Abrechnung nach Aufwand – kein Fixbetrag planbar' });
    } else if (!c.monthly_fixed_price || c.monthly_fixed_price === 0) {
      warnings.push({ source_type: 'recurring_contract', id: c.id, title, issue: 'Kein monatlicher Fixpreis angegeben' });
    }

    // One-time payment on top of recurring
    if (Number(c.one_time_payment) > 0 && interval !== 'once') {
      const billMonth = toMonth(c.start_date) || CURRENT_MONTH;
      if (clamp2026(billMonth)) {
        items.push({
          source_type: 'recurring_contract',
          source_id: c.id,
          title: title + ' (Einmalig)',
          customer_or_supplier: c.customer || '—',
          category: c.contract_type || 'other',
          month: billMonth,
          direction: 'inflow',
          amount: Number(c.one_time_payment),
          weighted_amount: weightedAmount(c.one_time_payment, prob),
          probability_percent: prob,
          status: 'planned',
          notes: 'Einmalzahlung',
        });
      }
    }
  });

  return { items, warnings };
}

// ─── 3. Tool Costs ───────────────────────────────────────────────────────────

export function buildToolCostItems(tools, scenario) {
  const items = [];
  const warnings = [];

  tools.forEach((t) => {
    const shouldCancel = t.decision_status === 'cancel' || t.needed === false;
    if (shouldCancel && scenario !== 'best_case') return;

    const interval = t.payment_interval || 'monthly';
    const alreadyPaid = t.payment_status === 'paid';
    const status = alreadyPaid ? 'paid' : 'planned';
    const title = t.tool_name || '—';

    if (interval === 'monthly' && Number(t.monthly_cost) > 0) {
      MONTHS_2026.forEach((month) => {
        items.push({
          source_type: 'tool_cost',
          source_id: t.id,
          title,
          customer_or_supplier: t.department || '—',
          category: t.department || 'other',
          month,
          direction: 'outflow',
          amount: Number(t.monthly_cost),
          weighted_amount: Number(t.monthly_cost),
          probability_percent: 100,
          status,
          notes: t.info || (t.customer_recharge ? `Weiterverre.: ${t.customer_recharge}` : ''),
        });
      });
    } else if (interval === 'quarterly' && (Number(t.monthly_cost) > 0 || Number(t.annual_cost) > 0)) {
      const quarterlyAmount = Number(t.monthly_cost) > 0
        ? Number(t.monthly_cost) * 3
        : Number(t.annual_cost) / 4;
      [0, 3, 6, 9].forEach((i) => {
        items.push({
          source_type: 'tool_cost',
          source_id: t.id,
          title,
          customer_or_supplier: t.department || '—',
          category: t.department || 'other',
          month: MONTHS_2026[i],
          direction: 'outflow',
          amount: quarterlyAmount,
          weighted_amount: quarterlyAmount,
          probability_percent: 100,
          status,
          notes: t.info || '',
        });
      });
    } else if (interval === 'yearly' || interval === 'one_time') {
      const amount = Number(t.annual_cost) || Number(t.monthly_cost) * 12 || 0;
      if (amount === 0) {
        warnings.push({ source_type: 'tool_cost', id: t.id, title, issue: 'Kein Betrag für jährliches Tool' });
        return;
      }
      const billMonth = toMonth(t.due_date) || CURRENT_MONTH;
      if (!clamp2026(billMonth)) return;
      items.push({
        source_type: 'tool_cost',
        source_id: t.id,
        title,
        customer_or_supplier: t.department || '—',
        category: t.department || 'other',
        month: billMonth,
        direction: 'outflow',
        amount,
        weighted_amount: amount,
        probability_percent: 100,
        status,
        notes: t.info || '',
      });
    } else if (interval === 'unclear') {
      // Distribute as monthly estimate
      if (Number(t.annual_cost) > 0) {
        const monthly = Number(t.annual_cost) / 12;
        MONTHS_2026.forEach((month) => {
          items.push({
            source_type: 'tool_cost',
            source_id: t.id,
            title,
            customer_or_supplier: t.department || '—',
            category: t.department || 'other',
            month,
            direction: 'outflow',
            amount: monthly,
            weighted_amount: monthly,
            probability_percent: 100,
            status: 'uncertain',
            notes: 'Intervall unklar – verteilt auf 12 Monate',
          });
        });
        warnings.push({ source_type: 'tool_cost', id: t.id, title, issue: 'Zahlungsintervall unklar – auf Monate verteilt' });
      } else {
        warnings.push({ source_type: 'tool_cost', id: t.id, title, issue: 'Kein Betrag und kein Intervall definiert' });
      }
    }
  });

  return { items, warnings };
}

// ─── 4. Receivables ──────────────────────────────────────────────────────────

export function buildReceivableItems(receivables, scenario) {
  const items = [];
  const warnings = [];

  receivables.forEach((r) => {
    if (r.status === 'paid' || r.status === 'write_off' || r.status === 'cancelled') return;

    const risk = r.collection_risk || 'low';
    if (scenario === 'conservative' && risk !== 'low') return;
    if (scenario === 'realistic' && (risk === 'high' || risk === 'critical')) return;

    const probMap = { low: 90, medium: 70, high: 40, critical: 20, unclear: 50 };
    const prob = probMap[risk] || 70;
    const amount = Number(r.net_amount) || Number(r.gross_amount) || 0;

    if (!r.due_date) {
      warnings.push({ source_type: 'receivable', id: r.id, title: `${r.customer} ${r.invoice_number || ''}`, issue: 'Kein Fälligkeitsdatum' });
    }

    // Overdue → place in current month
    let month = toMonth(r.due_date);
    if (!month) month = CURRENT_MONTH;
    const isOverdue = r.due_date && r.due_date < TODAY;

    items.push({
      source_type: 'receivable',
      source_id: r.id,
      title: [r.customer, r.invoice_number].filter(Boolean).join(' / '),
      customer_or_supplier: r.customer || '—',
      category: 'receivable',
      month,
      direction: 'inflow',
      amount,
      weighted_amount: weightedAmount(amount, prob),
      probability_percent: prob,
      status: isOverdue ? 'overdue' : (r.status || 'open'),
      notes: r.remarks || (isOverdue ? `Überfällig seit ${r.due_date}` : ''),
    });
  });

  return { items, warnings };
}

// ─── 5. Payables ─────────────────────────────────────────────────────────────

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

    let month = toMonth(p.payment_planned_date) || toMonth(p.due_date);
    if (!month) {
      month = CURRENT_MONTH;
      warnings.push({ source_type: 'payable', id: p.id, title: `${p.supplier} ${p.invoice_number || ''}`, issue: 'Kein Zahlungs- oder Fälligkeitsdatum' });
    }

    items.push({
      source_type: 'payable',
      source_id: p.id,
      title: [p.supplier, p.invoice_number].filter(Boolean).join(' / '),
      customer_or_supplier: p.supplier || '—',
      category: 'payable',
      month,
      direction: 'outflow',
      amount,
      weighted_amount: weightedAmount(amount, prob),
      probability_percent: prob,
      status: p.status || 'open',
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

  push(buildPlanLineItems(planLines, scenario));
  push(buildContractItems(contracts, scenario));
  push(buildToolCostItems(tools, scenario));
  push(buildReceivableItems(receivables, scenario));
  push(buildPayableItems(payables, scenario));

  // Source summary counts
  const sourceSummary = {
    plan_lines: allItems.filter(i => i.source_type === 'plan_line').length,
    recurring_contracts: allItems.filter(i => i.source_type === 'recurring_contract').length,
    tool_costs: allItems.filter(i => i.source_type === 'tool_cost').length,
    receivables: allItems.filter(i => i.source_type === 'receivable').length,
    payables: allItems.filter(i => i.source_type === 'payable').length,
  };

  let balance = openingBalance;
  const months = MONTHS_2026.map((month) => {
    const monthItems = allItems.filter((i) => i.month === month);
    const inflow_items = monthItems.filter((i) => i.direction === 'inflow');
    const outflow_items = monthItems.filter((i) => i.direction === 'outflow');

    const inflow = inflow_items.reduce((s, i) => s + i.amount, 0);
    const weighted_inflow = inflow_items.reduce((s, i) => s + i.weighted_amount, 0);

    // Fixed costs added as outflow
    const fixedOutflow = (Number(fixedMonthlyCosts) || 0) + (Number(taxObligations) || 0);
    const outflow = outflow_items.reduce((s, i) => s + i.amount, 0) + fixedOutflow;
    const weighted_outflow = outflow_items.reduce((s, i) => s + i.weighted_amount, 0) + fixedOutflow;

    const net_cashflow = inflow - outflow;
    const weighted_net = weighted_inflow - weighted_outflow;
    balance += weighted_net;

    const sourceBreakdown = {
      plan_lines_in: inflow_items.filter(i => i.source_type === 'plan_line').reduce((s, i) => s + i.weighted_amount, 0),
      contracts_in: inflow_items.filter(i => i.source_type === 'recurring_contract').reduce((s, i) => s + i.weighted_amount, 0),
      receivables_in: inflow_items.filter(i => i.source_type === 'receivable').reduce((s, i) => s + i.weighted_amount, 0),
      tool_costs_out: outflow_items.filter(i => i.source_type === 'tool_cost').reduce((s, i) => s + i.weighted_amount, 0),
      payables_out: outflow_items.filter(i => i.source_type === 'payable').reduce((s, i) => s + i.weighted_amount, 0),
      plan_lines_out: outflow_items.filter(i => i.source_type === 'plan_line').reduce((s, i) => s + i.weighted_amount, 0),
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
      outflow_items,
      source_breakdown: sourceBreakdown,
      risk_flags,
    };
  });

  return { months, warnings: allWarnings, sourceSummary };
}