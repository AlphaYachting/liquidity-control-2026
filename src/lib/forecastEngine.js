/**
 * forecastEngine.js
 * Dynamischer Forecast-Horizont: aktueller Monat + 11 Monate
 *
 * Datenquellen:
 *  1. LiquidityPlanLine
 *  2. RecurringContract
 *  3. ToolCost
 *  4. Receivable  (manuelle Forderungsliste)
 *  5. Payable
 *  6. InvoiceRecord (tatsächliche Rechnungen aus sevDesk/manuell)
 */

import { MONTHS_2026, weightedAmount } from './liquidityUtils';

// MONTHS_2026 ist jetzt dynamisch: [aktueller Monat, ..., +11 Monate]
const FORECAST_MONTHS = MONTHS_2026;
const CURRENT_MONTH = FORECAST_MONTHS[0];

// Heutiges Datum als String YYYY-MM-DD (lokal, kein UTC-Bug)
const _now = new Date();
const TODAY = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Gibt den Monat (YYYY-MM) zurück, sofern er im Forecast-Horizont liegt.
 * Vergangene Monate werden auf CURRENT_MONTH umgebogen (Fälligkeit bereits erreicht).
 */
const toForecastMonth = (dateStr) => {
  if (!dateStr) return null;
  const m = dateStr.slice(0, 7); // YYYY-MM
  if (m < CURRENT_MONTH) return CURRENT_MONTH; // Vergangenheit → aktueller Monat
  if (FORECAST_MONTHS.includes(m)) return m;
  return null; // jenseits des 12-Monats-Horizonts → ignorieren
};

/**
 * Gibt den Index des Monats im FORECAST_MONTHS-Array zurück (-1 wenn nicht enthalten).
 */
const monthIdx = (m) => FORECAST_MONTHS.indexOf(m);

// ─── 1. Plan Lines ───────────────────────────────────────────────────────────

export function buildPlanLineItems(planLines, scenario) {
  const items = [];
  const warnings = [];

  planLines.forEach((l) => {
    if (l.status === 'cancelled') return;
    if (l.status === 'uncertain' && scenario === 'conservative') return;

    // Bereits bezahlte Planzeilen nicht nochmals als Zufluss zeigen
    if (l.status === 'paid') return;

    const month = toForecastMonth(l.month) || toForecastMonth(l.payment_due_date) || toForecastMonth(l.date);
    if (!month) {
      if (l.month || l.payment_due_date || l.date) {
        // Hat ein Datum, liegt aber außerhalb des Horizonts → still ignorieren
        return;
      }
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

    // Startmonat: frühestens CURRENT_MONTH (kein Vergangenheits-Aufholen)
    const rawStart = c.start_date ? c.start_date.slice(0, 7) : CURRENT_MONTH;
    const startMonth = rawStart < CURRENT_MONTH ? CURRENT_MONTH : rawStart;
    const startIndex = Math.max(monthIdx(startMonth), 0);
    if (startIndex < 0) return; // Vertrag komplett außerhalb des Horizonts

    // Endmonat: maximal letzter Forecast-Monat
    const rawEnd = c.due_date ? c.due_date.slice(0, 7) : FORECAST_MONTHS[11];
    const endMonth = rawEnd > FORECAST_MONTHS[11] ? FORECAST_MONTHS[11] : rawEnd;
    const endIndex = Math.min(monthIdx(endMonth), 11);
    if (endIndex < 0 || endIndex < startIndex) return; // Vertrag bereits abgelaufen

    if (interval === 'monthly' && Number(c.monthly_fixed_price) > 0) {
      for (let i = startIndex; i <= endIndex; i++) {
        items.push({
          source_type: 'recurring_contract',
          source_id: c.id,
          title,
          customer_or_supplier: c.customer || '—',
          category: c.contract_type || 'other',
          month: FORECAST_MONTHS[i],
          direction: 'inflow',
          amount: Number(c.monthly_fixed_price),
          weighted_amount: weightedAmount(c.monthly_fixed_price, prob),
          probability_percent: prob,
          status: isUnclear ? 'uncertain' : 'planned',
          notes: c.notes || '',
        });
      }
    } else if (interval === 'quarterly' && (Number(c.monthly_fixed_price) > 0 || Number(c.annual_amount) > 0)) {
      const quarterlyAmount = Number(c.monthly_fixed_price) > 0
        ? Number(c.monthly_fixed_price) * 3
        : Number(c.annual_amount) / 4;
      for (let i = startIndex; i <= endIndex; i += 3) {
        items.push({
          source_type: 'recurring_contract',
          source_id: c.id,
          title,
          customer_or_supplier: c.customer || '—',
          category: c.contract_type || 'other',
          month: FORECAST_MONTHS[i],
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
      const billMonth = toForecastMonth(c.due_date) || toForecastMonth(c.start_date);
      if (!billMonth) return; // außerhalb Horizont
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
      warnings.push({ source_type: 'recurring_contract', id: c.id, title, issue: 'Abrechnung nach Aufwand – kein Fixbetrag planbar' });
    } else if (!c.monthly_fixed_price || c.monthly_fixed_price === 0) {
      warnings.push({ source_type: 'recurring_contract', id: c.id, title, issue: 'Kein monatlicher Fixpreis angegeben' });
    }

    // Einmalzahlung zusätzlich zur laufenden Rate
    if (Number(c.one_time_payment) > 0 && interval !== 'once') {
      const billMonth = toForecastMonth(c.start_date);
      if (billMonth) {
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

    // Bereits bezahlte Tools nicht nochmals als Abfluss zeigen
    if (t.payment_status === 'paid') return;

    const interval = t.payment_interval || 'monthly';
    const title = t.tool_name || '—';

    if (interval === 'monthly' && Number(t.monthly_cost) > 0) {
      // Nur ab aktuellem Monat iterieren
      FORECAST_MONTHS.forEach((month) => {
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
          status: 'planned',
          notes: t.info || (t.customer_recharge ? `Weiterverr.: ${t.customer_recharge}` : ''),
        });
      });
    } else if (interval === 'quarterly' && (Number(t.monthly_cost) > 0 || Number(t.annual_cost) > 0)) {
      const quarterlyAmount = Number(t.monthly_cost) > 0
        ? Number(t.monthly_cost) * 3
        : Number(t.annual_cost) / 4;
      // Nächste 4 Quartale ab aktuellem Monat
      [0, 3, 6, 9].forEach((offset) => {
        if (offset < FORECAST_MONTHS.length) {
          items.push({
            source_type: 'tool_cost',
            source_id: t.id,
            title,
            customer_or_supplier: t.department || '—',
            category: t.department || 'other',
            month: FORECAST_MONTHS[offset],
            direction: 'outflow',
            amount: quarterlyAmount,
            weighted_amount: quarterlyAmount,
            probability_percent: 100,
            status: 'planned',
            notes: t.info || '',
          });
        }
      });
    } else if (interval === 'yearly' || interval === 'one_time') {
      const amount = Number(t.annual_cost) || Number(t.monthly_cost) * 12 || 0;
      if (amount === 0) {
        warnings.push({ source_type: 'tool_cost', id: t.id, title, issue: 'Kein Betrag für jährliches Tool' });
        return;
      }
      const billMonth = toForecastMonth(t.due_date);
      if (!billMonth) return; // außerhalb Horizont oder bereits bezahlt
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
        status: 'planned',
        notes: t.info || '',
      });
    } else if (interval === 'unclear') {
      if (Number(t.annual_cost) > 0) {
        const monthly = Number(t.annual_cost) / 12;
        FORECAST_MONTHS.forEach((month) => {
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

    // Überfällige und vergangene Forderungen → in aktuellen Monat falten
    const month = toForecastMonth(r.due_date) || CURRENT_MONTH;
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

    // Fällige oder überfällige Eingangsrechnungen → in aktuellen Monat falten
    const month = toForecastMonth(p.payment_planned_date) || toForecastMonth(p.due_date) || CURRENT_MONTH;

    if (!p.payment_planned_date && !p.due_date) {
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

// ─── 6. InvoiceRecord (echte Rechnungen aus sevDesk / manuell) ───────────────

/**
 * Bringt tatsächliche offene Ausgangsrechnungen (InvoiceRecord) in den Forecast.
 * Rechnungen die bereits in Receivable erfasst sind (matched) werden übersprungen
 * um Doppelzählung zu vermeiden.
 */
export function buildInvoiceRecordItems(invoiceRecords, receivables, scenario) {
  const items = [];
  const warnings = [];

  // Bereits als Receivable erfasste Rechnungsnummern → kein Doppelt-Zählen
  const matchedInvoiceNumbers = new Set(
    receivables
      .filter(r => r.invoice_number)
      .map(r => r.invoice_number.trim().toLowerCase())
  );

  invoiceRecords.forEach((inv) => {
    // Bereits bezahlt, storniert oder Gutschriften → raus
    if (inv.payment_status === 'paid' || inv.payment_status === 'cancelled') return;
    if (inv.is_credit_note) return;
    // Entwürfe (noch nicht versendet) → im konservativen/realistischen Szenario ignorieren
    if (inv.payment_status === 'draft' && scenario !== 'best_case') return;

    // Vermeide Doppelzählung: Rechnungsnummer case-insensitive abgleichen
    const invNum = inv.invoice_number ? inv.invoice_number.trim().toLowerCase() : null;
    if (invNum && matchedInvoiceNumbers.has(invNum)) return;

    const amount = Number(inv.open_amount) > 0
      ? Number(inv.open_amount)
      : Number(inv.net_amount) || 0;
    if (amount <= 0) return;

    const risk = inv.payment_status === 'overdue' ? 'high'
               : inv.payment_status === 'partially_paid' ? 'medium'
               : 'low';

    // Szenarien-Filter: überfällige und unsichere Rechnungen bei konservativ weglassen
    if (scenario === 'conservative' && risk !== 'low') return;

    const probMap = { low: 90, medium: 75, high: 50, unclear: 60 };
    const prob = probMap[risk] || 80;

    const month = toForecastMonth(inv.due_date) || toForecastMonth(inv.invoice_date) || CURRENT_MONTH;
    const isOverdue = inv.due_date && inv.due_date < TODAY;

    if (!inv.due_date && !inv.invoice_date) {
      warnings.push({
        source_type: 'invoice_record',
        id: inv.id,
        title: `${inv.customer_name} ${inv.invoice_number || ''}`,
        issue: 'Kein Fälligkeitsdatum auf Rechnung',
      });
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

// ─── 7. MonthlyBillingPlan (PM-Rechnungsplanung) ─────────────────────────────

/**
 * Bringt MonthlyBillingPlan-Einträge in den Forecast.
 * BillingInstructions die bereits einen InvoiceRecord haben (invoice_created/paid)
 * werden übersprungen um Doppelzählung mit InvoiceRecord-Quelle zu vermeiden.
 * Auch MonthlyBillingPlans die bereits eine linked_billing_instruction_id haben
 * werden übersprungen — die Instruction ist die verlässlichere Quelle.
 */
export function buildBillingPlanItems(billingPlans, billingInstructions, scenario) {
  const items = [];
  const warnings = [];

  // Instruktionen die bereits als InvoiceRecord verbucht sind → nicht nochmals zählen
  const invoicedInstructionIds = new Set(
    billingInstructions
      .filter(i => i.status === 'invoice_created' || i.status === 'paid')
      .map(i => i.id)
  );

  // Aktive Plan-Statuses (keine abgeschlossenen/verschobenen)
  const ACTIVE_STATUSES = ['open', 'planned', 'in_review', 'ready_for_invoice', 'sent_to_backoffice'];

  billingPlans.forEach((p) => {
    if (!ACTIVE_STATUSES.includes(p.billing_status)) return;
    const amount = Number(p.planned_amount_net) || 0;
    if (amount <= 0) return;

    // Hat dieser Plan bereits eine verknüpfte Instruction?
    if (p.linked_billing_instruction_id) {
      // Wenn die Instruction bereits invoice_created/paid ist → InvoiceRecord übernimmt
      if (invoicedInstructionIds.has(p.linked_billing_instruction_id)) return;
      // Sonst: Instruction ist die Quelle → Plan überspringen (Instruction zählt via BillingInstruction-Quelle oder InvoiceRecord)
      return;
    }

    const month = toForecastMonth(p.planning_month);
    if (!month) return; // außerhalb Horizont

    // Wahrscheinlichkeit nach Status
    const probMap = {
      open: 60,
      planned: 75,
      in_review: 80,
      ready_for_invoice: 90,
      sent_to_backoffice: 95,
    };
    const prob = scenario === 'conservative'
      ? Math.min(probMap[p.billing_status] || 70, 70)
      : scenario === 'best_case'
      ? 95
      : probMap[p.billing_status] || 70;

    items.push({
      source_type: 'billing_plan',
      source_id: p.id,
      title: `Rechnungsplanung ${p.planning_month}`,
      customer_or_supplier: '—',
      category: 'billing_plan',
      month,
      direction: 'inflow',
      amount,
      weighted_amount: weightedAmount(amount, prob),
      probability_percent: prob,
      status: p.billing_status || 'planned',
      notes: p.invoice_reason || p.internal_note || '',
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
  billingPlans = [],
  billingInstructions = [],
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
  push(buildInvoiceRecordItems(invoiceRecords, receivables, scenario));
  push(buildBillingPlanItems(billingPlans, billingInstructions, scenario));

  // Source summary counts
  const sourceSummary = {
    plan_lines: allItems.filter(i => i.source_type === 'plan_line').length,
    recurring_contracts: allItems.filter(i => i.source_type === 'recurring_contract').length,
    tool_costs: allItems.filter(i => i.source_type === 'tool_cost').length,
    receivables: allItems.filter(i => i.source_type === 'receivable').length,
    payables: allItems.filter(i => i.source_type === 'payable').length,
    invoice_records: allItems.filter(i => i.source_type === 'invoice_record').length,
    billing_plans: allItems.filter(i => i.source_type === 'billing_plan').length,
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
    const fixedOutflow = fixedCosts + taxObl;

    // Fixed costs als eigene Items damit sie im DrillDown sichtbar sind
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
      plan_lines_in: inflow_items.filter(i => i.source_type === 'plan_line').reduce((s, i) => s + i.weighted_amount, 0),
      contracts_in: inflow_items.filter(i => i.source_type === 'recurring_contract').reduce((s, i) => s + i.weighted_amount, 0),
      receivables_in: inflow_items.filter(i => i.source_type === 'receivable').reduce((s, i) => s + i.weighted_amount, 0),
      invoice_records_in: inflow_items.filter(i => i.source_type === 'invoice_record').reduce((s, i) => s + i.weighted_amount, 0),
      billing_plans_in: inflow_items.filter(i => i.source_type === 'billing_plan').reduce((s, i) => s + i.weighted_amount, 0),
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