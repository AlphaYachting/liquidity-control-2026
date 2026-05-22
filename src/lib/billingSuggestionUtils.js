/**
 * Deterministic Billing Suggestion Utility — V1 (no LLM)
 * 
 * Generates a conservative billing suggestion based on project financials,
 * awork progress, and payment status.
 * 
 * After validation, this can be replaced or augmented by a real LLM call
 * that returns the same JSON schema.
 */

/**
 * Round down to nearest 5% step (minimum 5 if > 0)
 */
function roundDownTo5(value) {
  if (value <= 0) return 0;
  const floored = Math.floor(value / 5) * 5;
  return Math.max(0, floored);
}

/**
 * Format currency for text templates
 */
function fmtEur(amount) {
  return new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(amount || 0);
}

/**
 * Derive confidence level from score
 */
function scoreToLevel(score) {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/**
 * generateDeterministicBillingSuggestion
 *
 * @param {Object} ctx - Context object
 * @returns {Object} - Suggestion output
 */
export function generateDeterministicBillingSuggestion(ctx) {
  const {
    instruction_type,
    total_order_net = 0,
    total_order_gross = 0,
    already_invoiced_net = 0,
    already_paid_gross = 0,
    open_to_invoice_net = 0,
    previous_billing_percent = 0,
    payment_percent = 0,
    performance_percent = 0,
    unpaid_invoices_count = 0,
    overdue_invoices_count = 0,
    awork_tasks_blocked = 0,
    project_risk_status = 'none',
    manual_amount_input = null,
    manual_percent_input = null,
    vat_rate = 20,
    customer_name = '',
    project_name = '',
    has_awork_data = false,
  } = ctx;

  const result = {
    suggested_instruction_type: instruction_type,
    suggested_invoice_type: 'partial_invoice',
    suggested_additional_billing_percent: 0,
    suggested_new_billing_percent: 0,
    suggested_amount_net: 0,
    suggested_amount_gross: null,
    suggested_invoice_reason: '',
    suggested_invoice_instruction_text: '',
    suggested_internal_note: '',
    confidence_score: 50,
    confidence_level: 'medium',
    calculation_basis: has_awork_data ? 'awork' : 'manual',
    supporting_facts: [],
    risk_flags: [],
    payment_warning: null,
    progress_warning: null,
    open_invoice_warning: null,
  };

  // No order value — can't suggest
  if (total_order_net <= 0) {
    result.confidence_level = 'low';
    result.confidence_score = 0;
    result.risk_flags.push('no_order_value');
    result.progress_warning = 'Kein bestätigter Auftragswert vorhanden. Kein Vorschlag möglich.';
    return result;
  }

  // No open amount — can't suggest
  if (open_to_invoice_net <= 0) {
    result.confidence_level = 'low';
    result.confidence_score = 0;
    result.risk_flags.push('no_open_amount');
    result.progress_warning = 'Kein offener abrechenbarer Betrag vorhanden.';
    return result;
  }

  // ── PERCENTAGE BASED ─────────────────────────────────────────────────────
  if (instruction_type === 'percentage_based') {
    const progress_gap = performance_percent - previous_billing_percent;

    if (progress_gap <= 0) {
      result.confidence_level = 'low';
      result.confidence_score = 15;
      result.risk_flags.push('no_progress_gap');
      result.progress_warning =
        'Der Abrechnungsstand liegt bereits auf oder über dem erkannten Leistungsfortschritt. Keine weitere Abrechnung empfohlen.';
      result.supporting_facts.push(
        `Leistungsfortschritt: ${Math.round(performance_percent)}%`,
        `Bisher abgerechnet: ${Math.round(previous_billing_percent)}%`,
        `Lücke: ${Math.round(progress_gap)}%`
      );
      _buildTexts(result, 0, previous_billing_percent, 0, instruction_type, ctx);
      return result;
    }

    let base = roundDownTo5(progress_gap * 0.75);
    base = Math.min(base, 30); // max 30% per instruction

    let score = 70;

    // Overdue invoices → halve and reduce confidence
    if (overdue_invoices_count > 0) {
      base = Math.max(0, roundDownTo5(base * 0.5));
      score -= 30;
      result.payment_warning = `Es gibt ${overdue_invoices_count} überfällige offene Rechnung(en). Vorschlag wurde reduziert. Zahlungssituation dringend klären.`;
      result.risk_flags.push('overdue_invoices');
    }

    // Unpaid invoices → lower confidence
    if (unpaid_invoices_count > 0 && overdue_invoices_count === 0) {
      score -= 15;
      result.open_invoice_warning = `Es sind ${unpaid_invoices_count} offene Rechnung(en) ausstehend. Vor weiterer Teilrechnung Zahlungssituation prüfen.`;
      result.risk_flags.push('open_invoices');
    }

    // Blocked tasks → cap suggestion
    if (awork_tasks_blocked > 2) {
      base = Math.min(base, 10);
      score -= 10;
      result.risk_flags.push('blocked_tasks');
    }

    // High risk project
    if (project_risk_status === 'high' || project_risk_status === 'critical') {
      base = Math.min(base, 10);
      score -= 10;
      result.risk_flags.push('high_risk_project');
    }

    // No awork data → lower confidence
    if (!has_awork_data) {
      score -= 15;
    }

    // Limit by open amount
    const max_pct_open = total_order_net > 0 ? (open_to_invoice_net / total_order_net) * 100 : 0;
    const final_percent = Math.min(base, max_pct_open);
    const rounded_final = roundDownTo5(final_percent);

    result.suggested_additional_billing_percent = rounded_final;
    result.suggested_new_billing_percent = Math.min(100, previous_billing_percent + rounded_final);
    result.suggested_amount_net = (total_order_net * rounded_final) / 100;
    result.suggested_amount_gross = result.suggested_amount_net * (1 + vat_rate / 100);
    result.confidence_score = Math.max(5, Math.min(95, score));
    result.confidence_level = scoreToLevel(result.confidence_score);

    result.supporting_facts = [
      `Leistungsfortschritt: ${Math.round(performance_percent)}%`,
      `Bisher abgerechnet: ${Math.round(previous_billing_percent)}%`,
      `Fortschrittslücke: ${Math.round(progress_gap)}% → konservativ ${rounded_final}% vorgeschlagen`,
      `Offen abrechenbar: ${fmtEur(open_to_invoice_net)}`,
      ...(!has_awork_data ? ['⚠ Kein awork/eWork-Datenbasis — geringere Sicherheit'] : []),
    ];

    _buildTexts(result, rounded_final, previous_billing_percent, result.suggested_amount_net, instruction_type, ctx);
    return result;
  }

  // ── MANUAL AMOUNT ─────────────────────────────────────────────────────────
  if (instruction_type === 'manual_amount') {
    let score = 60;

    if (manual_amount_input && manual_amount_input > 0) {
      // Evaluate entered amount
      const implied_pct = total_order_net > 0 ? (manual_amount_input / total_order_net) * 100 : 0;
      const progress_gap = performance_percent - previous_billing_percent;

      result.suggested_amount_net = manual_amount_input;
      result.suggested_amount_gross = manual_amount_input * (1 + vat_rate / 100);
      result.suggested_additional_billing_percent = roundDownTo5(implied_pct);
      result.suggested_new_billing_percent = Math.min(100, previous_billing_percent + result.suggested_additional_billing_percent);

      if (manual_amount_input > open_to_invoice_net) {
        score = 10;
        result.risk_flags.push('amount_exceeds_open');
        result.payment_warning = `Eingegebener Betrag (${fmtEur(manual_amount_input)}) überschreitet den offenen abrechenbaren Betrag (${fmtEur(open_to_invoice_net)}).`;
      } else if (implied_pct > progress_gap + 10) {
        score -= 20;
        result.risk_flags.push('amount_exceeds_progress');
        result.progress_warning = `Der eingegebene Betrag impliziert ${Math.round(implied_pct)}% Abrechnung, der Leistungsfortschritt beträgt jedoch nur ${Math.round(performance_percent)}%.`;
      }

      result.supporting_facts = [
        `Manuell eingegebener Betrag: ${fmtEur(manual_amount_input)}`,
        `Implizierter Abrechnungsanteil: ${Math.round(implied_pct)}%`,
        `Leistungsfortschritt: ${Math.round(performance_percent)}%`,
        `Offen abrechenbar: ${fmtEur(open_to_invoice_net)}`,
      ];
    } else {
      // No amount entered → use percentage logic to derive
      const progress_gap = performance_percent - previous_billing_percent;
      let base = progress_gap > 0 ? roundDownTo5(progress_gap * 0.75) : 0;
      base = Math.min(base, 30);
      if (overdue_invoices_count > 0) base = Math.max(0, roundDownTo5(base * 0.5));
      if (awork_tasks_blocked > 2) base = Math.min(base, 10);

      const max_pct_open = total_order_net > 0 ? (open_to_invoice_net / total_order_net) * 100 : 0;
      const final_pct = roundDownTo5(Math.min(base, max_pct_open));
      const suggested_net = (total_order_net * final_pct) / 100;

      result.suggested_additional_billing_percent = final_pct;
      result.suggested_new_billing_percent = Math.min(100, previous_billing_percent + final_pct);
      result.suggested_amount_net = suggested_net;
      result.suggested_amount_gross = suggested_net * (1 + vat_rate / 100);
      score = 50;

      result.supporting_facts = [
        `Kein Betrag eingegeben — Vorschlag aus Fortschrittsanalyse`,
        `Leistungsfortschritt: ${Math.round(performance_percent)}%`,
        `Bisher abgerechnet: ${Math.round(previous_billing_percent)}%`,
        `Vorgeschlagener Betrag: ${fmtEur(suggested_net)} (${final_pct}%)`,
      ];
    }

    // Common warnings for manual
    if (overdue_invoices_count > 0) {
      score -= 25;
      result.payment_warning = result.payment_warning || `Es gibt ${overdue_invoices_count} überfällige Rechnung(en). Zahlungssituation klären.`;
      result.risk_flags.push('overdue_invoices');
    }
    if (unpaid_invoices_count > 0 && overdue_invoices_count === 0) {
      score -= 10;
      result.open_invoice_warning = `Es sind ${unpaid_invoices_count} offene Rechnung(en) ausstehend.`;
    }
    if (!has_awork_data) score -= 10;

    result.confidence_score = Math.max(5, Math.min(95, score));
    result.confidence_level = scoreToLevel(result.confidence_score);

    _buildTexts(
      result,
      result.suggested_additional_billing_percent,
      previous_billing_percent,
      result.suggested_amount_net,
      instruction_type,
      ctx
    );
    return result;
  }

  return result;
}

/**
 * Build German text templates for invoice_reason and invoice_instruction_text
 */
function _buildTexts(result, additionalPct, prevPct, amountNet, type, ctx) {
  const {
    project_name = 'dieses Projekt',
    customer_name = '',
    performance_percent = 0,
    unpaid_invoices_count = 0,
    overdue_invoices_count = 0,
  } = ctx;

  const openInvoiceNote =
    unpaid_invoices_count > 0 || overdue_invoices_count > 0
      ? ' Es bestehen noch offene Rechnungen; die Zahlungssituation sollte vor Freigabe geprüft werden.'
      : '';

  if (type === 'percentage_based') {
    result.suggested_invoice_reason =
      `Auf Basis des aktuellen Projektfortschritts und des bisherigen Abrechnungsstands wird eine weitere Teilrechnung über ${additionalPct}% des bestätigten Auftragswerts vorgeschlagen. ` +
      `Der erkannte Leistungsfortschritt liegt bei ca. ${Math.round(performance_percent)}%, der bisherige Abrechnungsstand bei ca. ${Math.round(prevPct)}%.` +
      openInvoiceNote;

    result.suggested_invoice_instruction_text =
      `Teilrechnung gemäß Projektfortschritt für bereits erbrachte Leistungen im Projekt "${project_name}". ` +
      `Abrechnung über ${additionalPct}% des bestätigten Auftragswerts laut Auftragsbestätigung. Neuer kumulierter Abrechnungsstand: ${Math.round(result.suggested_new_billing_percent)}%.`;
  } else if (type === 'manual_amount') {
    result.suggested_invoice_reason =
      `Auf Basis des aktuellen Projektfortschritts wird eine Teilrechnung vorgeschlagen. ` +
      `Der erkannte Leistungsfortschritt liegt bei ca. ${Math.round(performance_percent)}%, der bisherige Abrechnungsstand bei ca. ${Math.round(prevPct)}%.` +
      openInvoiceNote;

    result.suggested_invoice_instruction_text =
      `Teilrechnung gemäß Projektfortschritt über den Betrag von ${fmtEur(amountNet)} netto für bereits erbrachte Leistungen im Projekt "${project_name}".` +
      (customer_name ? ` Kunde: ${customer_name}.` : '');
  }

  result.suggested_internal_note =
    `Vorschlag deterministische Analyse V1 — Basis: Leistung ${Math.round(performance_percent)}%, Abrechnung ${Math.round(prevPct)}%.` +
    (result.risk_flags.length > 0 ? ` Risikohinweise: ${result.risk_flags.join(', ')}.` : '');
}