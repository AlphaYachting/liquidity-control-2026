/**
 * Payment Data Utilities — visibility, freshness, and consistency helpers.
 * NEVER overwrites data automatically. All functions are read-only advisory.
 */

// --- Source type labels & styles ---
export const SOURCE_TYPE_CONFIG = {
  manual:   { label: 'Manuell',         color: 'bg-gray-100 text-gray-600',    live: false },
  excel:    { label: 'Excel Import',     color: 'bg-blue-100 text-blue-700',    live: false },
  csv:      { label: 'CSV Import',       color: 'bg-blue-100 text-blue-700',    live: false },
  pdf:      { label: 'PDF Import',       color: 'bg-purple-100 text-purple-700', live: false },
  sevdesk:  { label: 'sevDesk',          color: 'bg-emerald-100 text-emerald-700', live: true },
  other:    { label: 'Sonstige',         color: 'bg-gray-100 text-gray-500',    live: false },
};

export function getSourceConfig(sourceType) {
  return SOURCE_TYPE_CONFIG[sourceType] || { label: 'Quelle unbekannt', color: 'bg-amber-100 text-amber-700', live: false };
}

// --- Freshness check ---
/**
 * Returns number of days since the most recent InvoiceRecord was updated/paid.
 */
export function getPaymentDataAgeDays(invoiceRecords) {
  if (!invoiceRecords || invoiceRecords.length === 0) return null;
  const dates = invoiceRecords
    .map(i => i.updated_date || i.payment_date || i.invoice_date)
    .filter(Boolean)
    .map(d => new Date(d))
    .filter(d => !isNaN(d));
  if (dates.length === 0) return null;
  const newest = new Date(Math.max(...dates.map(d => d.getTime())));
  return Math.floor((Date.now() - newest.getTime()) / 86400000);
}

/**
 * Returns whether all invoices come from non-live sources (no sevDesk).
 */
export function hasNoLivePaymentSource(invoiceRecords) {
  if (!invoiceRecords || invoiceRecords.length === 0) return true;
  return !invoiceRecords.some(i => i.source_type === 'sevdesk');
}

/**
 * Returns freshness warning level: 'none' | 'warn' | 'stale'
 */
export function getPaymentFreshnessLevel(invoiceRecords) {
  if (!invoiceRecords || invoiceRecords.length === 0) return 'warn';
  if (!hasNoLivePaymentSource(invoiceRecords)) return 'none'; // has sevDesk = live
  const ageDays = getPaymentDataAgeDays(invoiceRecords);
  if (ageDays === null) return 'warn';
  if (ageDays > 14) return 'stale';
  return 'warn'; // always warn if not sevDesk
}

// --- Calculated open amount ---
/**
 * Calculates open amount from gross - paid.
 * paid_amount is treated as gross paid.
 */
export function calculateInvoiceOpenAmount(invoice) {
  const gross = Number(invoice.gross_amount) || 0;
  const paid = Number(invoice.paid_amount) || 0;
  const storedOpen = invoice.open_amount != null ? Number(invoice.open_amount) : null;
  const calculatedOpen = gross - paid;

  const warnings = [];

  if (invoice.payment_status === 'paid' && calculatedOpen > 0.01) {
    warnings.push('Status "Bezahlt", aber rechnerisch noch offener Betrag vorhanden.');
  }
  if ((invoice.payment_status === 'open' || invoice.payment_status === 'overdue') && calculatedOpen <= 0 && gross > 0) {
    warnings.push('Status "Offen/Überfällig", aber rechnerisch vollständig bezahlt.');
  }

  // Detect possible net-paid mix: if paid_amount * 1.2 ≈ gross, paid might be net
  const possibleNetPaid = paid > 0 && gross > 0 && Math.abs(paid * 1.2 - gross) < 1;
  if (possibleNetPaid) {
    warnings.push('Achtung: Bezahlter Betrag könnte Netto-Wert sein (Netto × 1,2 ≈ Brutto). Bitte prüfen.');
  }

  return {
    gross,
    paid_gross: paid,
    calculated_open: calculatedOpen,
    stored_open: storedOpen,
    stored_vs_calculated_diff: storedOpen !== null ? storedOpen - calculatedOpen : null,
    warnings,
  };
}

// --- Receivable vs InvoiceRecord consistency ---
/**
 * Checks consistency between InvoiceRecords and Receivables.
 * Returns an array of issue objects. Non-destructive.
 */
export function checkReceivableInvoiceConsistency(invoiceRecords, receivables) {
  const issues = [];

  // Build lookup maps
  const receivablesByInvoiceNum = {};
  const receivablesByCustomer = {};
  for (const r of receivables) {
    if (r.invoice_number) receivablesByInvoiceNum[r.invoice_number.trim().toLowerCase()] = r;
    const key = (r.customer || '').trim().toLowerCase();
    if (!receivablesByCustomer[key]) receivablesByCustomer[key] = [];
    receivablesByCustomer[key].push(r);
  }

  const invoiceByNum = {};
  for (const inv of invoiceRecords) {
    if (inv.invoice_number) invoiceByNum[inv.invoice_number.trim().toLowerCase()] = inv;
  }

  // Check each InvoiceRecord against Receivables
  for (const inv of invoiceRecords) {
    if (inv.is_credit_note || inv.payment_status === 'cancelled') continue;
    const invNum = (inv.invoice_number || '').trim().toLowerCase();
    const matchedReceivable = invNum ? receivablesByInvoiceNum[invNum] : null;

    if (!matchedReceivable) {
      // No Receivable for this invoice
      if (inv.payment_status !== 'paid') {
        issues.push({
          type: 'invoice_without_receivable',
          severity: 'info',
          invoice: inv,
          receivable: null,
          message: `Rechnung ${inv.invoice_number || '—'} hat keine zugehörige Forderung.`,
          suggested_action: 'Forderung anlegen oder ignorieren',
        });
      }
      continue;
    }

    const invCalc = calculateInvoiceOpenAmount(inv);

    // InvoiceRecord = paid, but Receivable = open/overdue
    if (
      (inv.payment_status === 'paid') &&
      (matchedReceivable.status === 'open' || matchedReceivable.status === 'overdue')
    ) {
      issues.push({
        type: 'paid_invoice_open_receivable',
        severity: 'high',
        invoice: inv,
        receivable: matchedReceivable,
        message: `Rechnung ${inv.invoice_number} als bezahlt markiert, aber Forderung noch offen.`,
        suggested_action: 'Forderung auf "bezahlt" setzen',
      });
    }

    // Partially paid mismatch
    if (
      inv.payment_status === 'partially_paid' &&
      matchedReceivable.status === 'open' &&
      (Number(inv.paid_amount) || 0) > 0
    ) {
      issues.push({
        type: 'partial_payment_not_reflected',
        severity: 'medium',
        invoice: inv,
        receivable: matchedReceivable,
        message: `Rechnung ${inv.invoice_number} teilbezahlt (${inv.paid_amount} €), Forderung zeigt vollen Betrag.`,
        suggested_action: 'Forderung auf "teilbezahlt" setzen',
      });
    }

    // Gross/Net mismatch (>10% difference)
    const invGross = Number(inv.gross_amount) || 0;
    const recvGross = Number(matchedReceivable.gross_amount) || 0;
    if (invGross > 0 && recvGross > 0 && Math.abs(invGross - recvGross) / invGross > 0.1) {
      issues.push({
        type: 'amount_mismatch',
        severity: 'medium',
        invoice: inv,
        receivable: matchedReceivable,
        message: `Betragsdifferenz: Rechnung ${inv.gross_amount} € vs. Forderung ${matchedReceivable.gross_amount} € (>10%).`,
        suggested_action: 'Beträge prüfen (Brutto/Netto-Mix?)',
      });
    }
  }

  // Check each Receivable without a matching InvoiceRecord
  for (const recv of receivables) {
    if (recv.status === 'paid') continue;
    const recvNum = (recv.invoice_number || '').trim().toLowerCase();
    if (recvNum && !invoiceByNum[recvNum]) {
      issues.push({
        type: 'receivable_without_invoice',
        severity: 'info',
        invoice: null,
        receivable: recv,
        message: `Forderung ${recv.invoice_number || '—'} (${recv.customer}) hat keine zugehörige InvoiceRecord.`,
        suggested_action: 'Rechnung anlegen oder Forderung als veraltet markieren',
      });
    }
  }

  return issues;
}

// --- Billing block project mismatch ---
/**
 * Returns a warning if a BillingBlock's project_id differs from its parent order's project_id.
 */
export function checkBillingBlockProjectMismatch(block, confirmedOrder) {
  if (!block || !confirmedOrder) return null;
  if (!block.project_id || !confirmedOrder.project_id) return null;
  if (block.project_id !== confirmedOrder.project_id) {
    return 'Abweichende Projektzuordnung: Dieses Auftragspaket ist einem anderen internen Reporting-Projekt zugeordnet als die Auftragsbestätigung.';
  }
  return null;
}