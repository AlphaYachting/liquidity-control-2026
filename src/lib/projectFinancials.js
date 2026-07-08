/**
 * Shared financial calculation helper for Project Cockpit.
 * Used by: Projects.jsx, ProjectDetail.jsx, ConfirmedOrderDetail.jsx
 *
 * PAID FALLBACK: If paid_amount = 0 but payment_status = 'paid',
 * gross_amount is used as paid amount. This handles PDF-imported invoices
 * where payment_status was set correctly but paid_amount was not populated.
 * DATA IS NEVER WRITTEN — read-only advisory only.
 */

/**
 * Calculate effective paid amount for a single invoice.
 * @param {object} invoice
 * @returns {{ amount: number, usedFallback: boolean }}
 */
export function getEffectivePaid(invoice) {
  const paid = Number(invoice.paid_amount) || 0;
  if (paid > 0) return { amount: paid, usedFallback: false };
  if (invoice.payment_status === 'paid') {
    return { amount: Number(invoice.gross_amount) || 0, usedFallback: true };
  }
  return { amount: 0, usedFallback: false };
}

/**
 * Full project financials from linked entities.
 *
 * @param {object} params
 * @param {object} params.project - LiquidityProject record
 * @param {array}  params.allOrders - all ConfirmedOrder records
 * @param {array}  params.allBlocks - all ProjectBillingBlock records
 * @param {array}  params.allInvoices - all InvoiceRecord records
 * @returns {object}
 */
export function calculateProjectFinancials({ project, allOrders, allBlocks, allInvoices }) {
  const projectId = project?.id;
  const customerKey = (project?.customer || '').toLowerCase();

  // ── Linked orders (directly by project_id) ──────────────────────────────
  const linkedOrders = allOrders.filter(o => o.project_id === projectId);
  const linkedOrderIds = new Set(linkedOrders.map(o => o.id));

  // ── Orders that belong to this customer but have no project_id ─────────
  const ordersWithoutProjectId = allOrders.filter(o =>
    !o.project_id &&
    (o.customer || '').toLowerCase() === customerKey
  );

  // ── Linked billing blocks ──────────────────────────────────────────────
  const linkedBlocks = allBlocks.filter(b =>
    b.project_id === projectId ||
    (b.confirmed_order_id && linkedOrderIds.has(b.confirmed_order_id))
  ).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const linkedBlockIds = new Set(linkedBlocks.map(b => b.id));

  // ── Linked order numbers set ───────────────────────────────────────────
  const linkedOrderNumbers = new Set(
    linkedOrders.map(o => (o.order_number || '').toLowerCase()).filter(Boolean)
  );

  // ── Linked invoices (hard-linked via relation fields or order_number only) ──
  // IMPORTANT: Customer-wide order matching (allOrderIdsForCustomer) was removed.
  // It caused invoices from one project's orders to appear in sibling projects of the same customer.
  // Invoices must be linked via project_id, confirmed_order_id (on a project-linked order),
  // billing_block_id, or order_number. Unlinked invoices go to likelyUnmatchedInvoices instead.
  const linkedInvoices = allInvoices.filter(i => {
    if (i.payment_status === 'cancelled') return false;
    // Korrektur-/Gutschriftbelege NICHT ausfiltern: sie werden unten sauber von
    // realInvoices getrennt (creditNotes) und korrekt abgezogen. So erscheint die
    // Gutschrift in der Rechnungsliste und neutralisiert die Ursprungsrechnung sichtbar.
    if (i.project_id === projectId) return true;
    if (i.confirmed_order_id && linkedOrderIds.has(i.confirmed_order_id)) return true;
    if (i.billing_block_id && linkedBlockIds.has(i.billing_block_id)) return true;
    if (i.order_number && linkedOrderNumbers.has((i.order_number || '').toLowerCase())) return true;
    return false;
  });
  const linkedInvoiceIds = new Set(linkedInvoices.map(i => i.id));

  // ── Orders without project_id that belong to this customer's invoices ──
  // Used only for warnings — invoices are already in linkedInvoices above.
  const orphanOrderIds = new Set(ordersWithoutProjectId.map(o => o.id));
  // orphanOrderInvoices is empty now since those invoices are captured in linkedInvoices
  // Keep the array for backwards compat but it will always be empty
  const orphanOrderInvoices = [];

  // ── Likely unmatched (customer name only, no hard relation) ───────────
  // Only shown as warning, never counted in project totals.
  const likelyUnmatchedInvoices = allInvoices.filter(i =>
    !linkedInvoiceIds.has(i.id) &&
    (i.customer_name || '').toLowerCase() === customerKey &&
    !i.project_id &&
    !i.confirmed_order_id &&
    !i.billing_block_id &&
    i.payment_status !== 'cancelled'
  );

  // ── Commercial base (priority: orders > blocks > project field) ────────
  const linkedOrdersTotalNet = linkedOrders.reduce((s, o) => s + (Number(o.total_net_amount) || 0), 0);
  const billingBlocksTotalNet = linkedBlocks.reduce((s, b) => s + (Number(b.amount_net) || 0), 0);
  const importedProjectTotalNet = Number(project?.total_net_amount) || 0;

  let commercialBaseNet, commercialBaseSource;
  if (linkedOrdersTotalNet > 0) {
    commercialBaseNet = linkedOrdersTotalNet;
    commercialBaseSource = 'orders';
  } else if (billingBlocksTotalNet > 0) {
    commercialBaseNet = billingBlocksTotalNet;
    commercialBaseSource = 'blocks';
  } else {
    commercialBaseNet = importedProjectTotalNet;
    commercialBaseSource = 'project';
  }

  // ── Invoice aggregation (linked only) ─────────────────────────────────
  const realInvoices = linkedInvoices.filter(i => !i.is_credit_note);
  const creditNotes = linkedInvoices.filter(i => i.is_credit_note);

  const invoicedNet = realInvoices.reduce((s, i) => s + (Number(i.net_amount) || 0), 0);
  const invoicedGross = realInvoices.reduce((s, i) => s + (Number(i.gross_amount) || 0), 0);
  const creditNoteNet = creditNotes.reduce((s, i) => s + (Number(i.net_amount) || 0), 0);
  const adjustedInvoicedNet = invoicedNet - creditNoteNet;

  // paid with fallback
  const paidGross = realInvoices.reduce((s, i) => s + getEffectivePaid(i).amount, 0);
  // paidNet: for each invoice, if paid, use net_amount; partial: proportional share
  const paidNet = realInvoices.reduce((s, i) => {
    const net = Number(i.net_amount) || 0;
    const gross = Number(i.gross_amount) || 1;
    const { amount: paidGrossAmt } = getEffectivePaid(i);
    if (paidGrossAmt <= 0) return s;
    // Proportional: paidNet = net * (paidGross / gross)
    return s + net * (paidGrossAmt / gross);
  }, 0);
  const openReceivableGross = Math.max(0, invoicedGross - paidGross);
  const openToInvoiceNet = commercialBaseNet - adjustedInvoicedNet;

  // ── Billing block KPIs ────────────────────────────────────────────────
  const invoiceReadyNet = linkedBlocks
    .filter(b => b.invoice_readiness_status === 'ready')
    .reduce((s, b) => s + (Number(b.amount_net) || 0), 0);

  const nextMonth = (() => {
    const d = new Date();
    const nm = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return `${nm.getFullYear()}-${String(nm.getMonth() + 1).padStart(2, '0')}`;
  })();
  const nextMonthForecastNet = linkedBlocks
    .filter(b => b.billing_month === nextMonth &&
      b.invoice_readiness_status !== 'invoiced' &&
      b.invoice_readiness_status !== 'paid')
    .reduce((s, b) => s + (Number(b.amount_net) || 0), 0);

  const blockedAmountNet = linkedBlocks
    .filter(b => b.work_status === 'blocked')
    .reduce((s, b) => s + (Number(b.amount_net) || 0), 0);

  // ── Warnings ──────────────────────────────────────────────────────────
  const warnings = [];

  if (ordersWithoutProjectId.length > 0) {
    warnings.push({
      type: 'missingProjectIdOnConfirmedOrder',
      orders: ordersWithoutProjectId,
      message: `${ordersWithoutProjectId.length} Auftragsbestätigung(en) dieses Kunden haben kein verknüpftes Projekt-Cockpit.`,
    });
  }

  if (orphanOrderInvoices.length > 0) {
    warnings.push({
      type: 'invoicesOnOrphanOrders',
      invoices: orphanOrderInvoices,
      message: `${orphanOrderInvoices.length} Rechnung(en) sind mit Auftragsbestätigungen verknüpft, die kein Projekt-Cockpit haben.`,
    });
  }

  if (Math.abs(commercialBaseNet - importedProjectTotalNet) > 1 && importedProjectTotalNet > 0 && commercialBaseSource !== 'project') {
    warnings.push({
      type: 'projectTotalMismatch',
      message: `Importierter Projektwert (${importedProjectTotalNet.toFixed(2)}) weicht von Auftragssumme (${commercialBaseNet.toFixed(2)}) ab.`,
    });
  }

  const paidStatusZeroPaid = realInvoices.filter(i =>
    i.payment_status === 'paid' && (Number(i.paid_amount) || 0) === 0 && (Number(i.gross_amount) || 0) > 0
  );
  if (paidStatusZeroPaid.length > 0) {
    warnings.push({
      type: 'paidStatusButZeroPaidAmount',
      invoices: paidStatusZeroPaid,
      message: `${paidStatusZeroPaid.length} Rechnung(en) als "Bezahlt" markiert, aber paid_amount = 0. Bruttobetrag wird als bezahlt gewertet (Import-Fallback).`,
    });
  }

  return {
    // Relations
    linkedOrders,
    linkedOrderIds,
    linkedBlocks,
    linkedBlockIds,
    linkedInvoices,
    orphanOrderInvoices,
    likelyUnmatchedInvoices,
    ordersWithoutProjectId,

    // Commercial
    linkedOrdersTotalNet,
    billingBlocksTotalNet,
    importedProjectTotalNet,
    commercialBaseNet,
    commercialBaseSource,

    // Invoice totals
    invoicedNet,
    invoicedGross,
    creditNoteNet,
    adjustedInvoicedNet,
    paidGross,
    paidNet,
    openReceivableGross,
    openToInvoiceNet,

    // Billing
    invoiceReadyNet,
    nextMonthForecastNet,
    blockedAmountNet,

    // Warnings
    warnings,
  };
}