// Reconciliation utilities for ConfirmedOrder ↔ BillingBlock ↔ InvoiceRecord
import { getEffectivePaid } from '@/lib/projectFinancials';

const today = () => new Date();

/**
 * Full reconciliation for one ConfirmedOrder.
 * @param {object} confirmedOrder
 * @param {array} billingBlocks - all blocks linked to this order
 * @param {array} invoiceRecords - all invoices linked to this order
 * @returns {object} reconciliation result
 */
export function calculateOrderReconciliation(confirmedOrder, billingBlocks, invoiceRecords) {
  const total_order_net = Number(confirmedOrder?.total_net_amount) || 0;
  const total_order_gross = Number(confirmedOrder?.total_gross_amount) || 0;

  const sum_billing_blocks_net = billingBlocks.reduce((s, b) => s + (Number(b.amount_net) || 0), 0);
  const sum_billing_blocks_gross = billingBlocks.reduce((s, b) => s + (Number(b.amount_gross) || 0), 0);

  const realInvoices = invoiceRecords.filter(i => !i.is_credit_note && i.payment_status !== 'cancelled');
  const creditNotes = invoiceRecords.filter(i => i.is_credit_note);

  const sum_invoiced_net = realInvoices.reduce((s, i) => s + (Number(i.net_amount) || 0), 0);
  const sum_invoiced_gross = realInvoices.reduce((s, i) => s + (Number(i.gross_amount) || 0), 0);
  const credit_note_total_net = creditNotes.reduce((s, i) => s + (Number(i.net_amount) || 0), 0);

  const adjusted_invoiced_net = sum_invoiced_net - credit_note_total_net;
  // PAID FALLBACK: uses shared getEffectivePaid() from projectFinancials.js
  const total_paid = realInvoices.reduce((s, i) => s + getEffectivePaid(i).amount, 0);

  const total_open_to_invoice = total_order_net - adjusted_invoiced_net;
  const total_open_receivable = Math.max(0, sum_invoiced_gross - total_paid);

  const difference_order_vs_blocks = total_order_net - sum_billing_blocks_net;
  const difference_blocks_vs_invoices = sum_billing_blocks_net - adjusted_invoiced_net;

  const completion_percent = total_order_net > 0
    ? Math.round((adjusted_invoiced_net / total_order_net) * 100)
    : 0;

  const warnings = [];
  if (Math.abs(difference_order_vs_blocks) > 1) {
    warnings.push(`Auftragssumme (${total_order_net.toFixed(2)}) ≠ Summe Pakete (${sum_billing_blocks_net.toFixed(2)}), Differenz: ${difference_order_vs_blocks.toFixed(2)}`);
  }
  if (adjusted_invoiced_net > total_order_net + 1) {
    warnings.push(`Verrechnet (${adjusted_invoiced_net.toFixed(2)}) überschreitet Auftragssumme (${total_order_net.toFixed(2)})`);
  }
  if (total_open_receivable < -1) {
    warnings.push(`Mehr bezahlt als verrechnet — mögliche Überzahlung (${total_open_receivable.toFixed(2)})`);
  }
  const unmatchedInvoices = invoiceRecords.filter(i => i.match_status === 'unmatched');
  if (unmatchedInvoices.length > 0) {
    warnings.push(`${unmatchedInvoices.length} Rechnung(en) nicht zugeordnet`);
  }
  const overdueBilling = billingBlocks.filter(b => {
    if (!b.planned_invoice_date) return false;
    if (b.invoice_readiness_status === 'invoiced' || b.invoice_readiness_status === 'paid') return false;
    return new Date(b.planned_invoice_date) < today();
  });
  if (overdueBilling.length > 0) {
    warnings.push(`${overdueBilling.length} Paket(e) mit überfälligem Rechnungsdatum`);
  }

  let reconciliation_status = 'balanced';
  if (warnings.length > 0) reconciliation_status = 'warning';
  if (Math.abs(difference_order_vs_blocks) > total_order_net * 0.05 || adjusted_invoiced_net > total_order_net + 1) {
    reconciliation_status = 'critical';
  }

  return {
    total_order_net,
    total_order_gross,
    sum_billing_blocks_net,
    sum_billing_blocks_gross,
    sum_invoiced_net,
    sum_invoiced_gross,
    credit_note_total_net,
    adjusted_invoiced_net,
    total_paid,
    total_open_receivable,
    total_open_to_invoice,
    difference_order_vs_blocks,
    difference_blocks_vs_invoices,
    completion_percent,
    reconciliation_status,
    warnings,
  };
}

/**
 * Status calculation for one ProjectBillingBlock.
 * @param {object} block
 * @param {array} invoiceRecords - invoices linked to this billing_block_id
 * @returns {object}
 */
export function calculateBillingBlockStatus(block, invoiceRecords) {
  const block_amount_net = Number(block.amount_net) || 0;
  const relevantInvoices = invoiceRecords.filter(i =>
    !i.is_credit_note && i.payment_status !== 'cancelled'
  );
  const invoiced_against_block = relevantInvoices.reduce((s, i) => s + (Number(i.net_amount) || 0), 0);
  const remaining_to_invoice = block_amount_net - invoiced_against_block;
  const paid_for_block = relevantInvoices.reduce((s, i) => s + getEffectivePaid(i).amount, 0);

  let payment_status = 'open';
  if (paid_for_block >= invoiced_against_block && invoiced_against_block > 0) payment_status = 'paid';
  else if (paid_for_block > 0) payment_status = 'partially_paid';

  const forecast_month = block.billing_month || null;
  const { invoice_readiness_status } = block;

  let days_until_planned_invoice = null;
  let is_overdue_to_invoice = false;
  if (block.planned_invoice_date) {
    const diff = Math.ceil((new Date(block.planned_invoice_date) - today()) / (1000 * 60 * 60 * 24));
    days_until_planned_invoice = diff;
    is_overdue_to_invoice = diff < 0 && invoice_readiness_status !== 'invoiced' && invoice_readiness_status !== 'paid';
  }

  const risk_adjusted_amount = block_amount_net * ((Number(block.probability_percent) || 90) / 100);

  return {
    block_amount_net,
    invoiced_against_block,
    remaining_to_invoice,
    payment_status,
    forecast_month,
    invoice_readiness_status,
    days_until_planned_invoice,
    is_overdue_to_invoice,
    risk_adjusted_amount,
  };
}

/**
 * What can be invoiced next month?
 * @param {array} billingBlocks
 * @param {array} invoiceRecords - ALL invoice records (will be grouped by billing_block_id)
 * @returns {object}
 */
export function calculateNextMonthBillable(billingBlocks, invoiceRecords) {
  const now = today();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;

  const invoicesByBlock = {};
  invoiceRecords.forEach(i => {
    if (!i.billing_block_id) return;
    if (!invoicesByBlock[i.billing_block_id]) invoicesByBlock[i.billing_block_id] = [];
    invoicesByBlock[i.billing_block_id].push(i);
  });

  const eligibleBlocks = billingBlocks.filter(b => {
    if (b.billing_month !== nextMonthStr) return false;
    if (b.invoice_readiness_status === 'invoiced' || b.invoice_readiness_status === 'paid') return false;
    if (b.work_status === 'blocked') return false;
    return true;
  });

  const enriched = eligibleBlocks.map(b => {
    const blockInvoices = invoicesByBlock[b.id] || [];
    const status = calculateBillingBlockStatus(b, blockInvoices);
    return { ...b, _status: status };
  });

  const next_month_planned_amount = enriched.reduce((s, b) => s + b._status.block_amount_net, 0);
  const next_month_invoice_ready_amount = enriched
    .filter(b => b.invoice_readiness_status === 'ready' || b.work_status === 'completed')
    .reduce((s, b) => s + b._status.block_amount_net, 0);
  const next_month_blocked_amount = enriched
    .filter(b => b.work_status === 'blocked' || b.invoice_readiness_status === 'not_ready')
    .reduce((s, b) => s + b._status.block_amount_net, 0);
  const next_month_already_invoiced_amount = enriched.reduce((s, b) => s + b._status.invoiced_against_block, 0);
  const next_month_expected_cash_in = enriched.reduce((s, b) => s + b._status.risk_adjusted_amount, 0);

  return {
    next_month_str: nextMonthStr,
    next_month_planned_amount,
    next_month_invoice_ready_amount,
    next_month_blocked_amount,
    next_month_already_invoiced_amount,
    next_month_expected_cash_in,
    blocks: enriched,
  };
}

/**
 * Match an invoice to orders/blocks using confidence scoring.
 * @param {object} invoice
 * @param {array} confirmedOrders
 * @param {array} billingBlocks
 * @returns {{ order, block, confidence, reason }}
 */
export function matchInvoiceToOrder(invoice, confirmedOrders, billingBlocks) {
  const inv = invoice;
  const invAmount = Number(inv.net_amount) || 0;
  const invCustomer = (inv.customer_name || '').toLowerCase();
  const invText = (inv.notes || inv.invoice_number || '').toLowerCase();

  let bestMatch = { order: null, block: null, confidence: 0, reason: 'Keine Übereinstimmung' };

  for (const order of confirmedOrders) {
    const orderCustomer = (order.customer || '').toLowerCase();
    const orderNum = (order.order_number || '').toLowerCase();
    const orderName = (order.project_name || '').toLowerCase();
    const orderAmount = Number(order.total_net_amount) || 0;

    // Level 1: exact order number match
    if (orderNum && invText.includes(orderNum)) {
      const confidence = Math.abs(invAmount - orderAmount) < 1 ? 100 : 90;
      if (confidence > bestMatch.confidence) {
        bestMatch = { order, block: null, confidence, reason: `Auftragsnummer exakt: ${order.order_number}` };
      }
    }

    // Level 2: customer + order number
    if (orderNum && invCustomer === orderCustomer && invText.includes(orderNum)) {
      if (95 > bestMatch.confidence) {
        bestMatch = { order, block: null, confidence: 95, reason: `Kunde + Auftragsnummer` };
      }
    }

    // Level 3: customer + project title
    if (invCustomer === orderCustomer && orderName && invText.includes(orderName.substring(0, 8))) {
      if (85 > bestMatch.confidence) {
        bestMatch = { order, block: null, confidence: 85, reason: `Kunde + Projekttitel ähnlich` };
      }
    }

    // Level 4: customer + similar amount (±5%)
    if (invCustomer === orderCustomer && orderAmount > 0 && Math.abs(invAmount - orderAmount) / orderAmount < 0.05) {
      if (70 > bestMatch.confidence) {
        bestMatch = { order, block: null, confidence: 70, reason: `Kunde + Betrag ähnlich (±5%)` };
      }
    }

    // Level 5: customer only
    if (invCustomer === orderCustomer) {
      if (50 > bestMatch.confidence) {
        bestMatch = { order, block: null, confidence: 50, reason: `Nur Kunde übereinstimmend` };
      }
    }
  }

  // Try to match billing block if order matched
  if (bestMatch.order && bestMatch.confidence >= 70) {
    const orderBlocks = billingBlocks.filter(b => b.confirmed_order_id === bestMatch.order.id);
    for (const block of orderBlocks) {
      const blockAmount = Number(block.amount_net) || 0;
      if (Math.abs(invAmount - blockAmount) < 1) {
        bestMatch.block = block;
        bestMatch.confidence = Math.min(100, bestMatch.confidence + 5);
        bestMatch.reason += ` + Paket exakt`;
        break;
      }
    }
  }

  return bestMatch;
}