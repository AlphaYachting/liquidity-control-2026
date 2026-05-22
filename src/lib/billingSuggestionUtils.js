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
 * checkBillingInstructionOverlap
 *
 * Checks whether a new billing suggestion would overlap with existing instructions.
 * Must be called before finalizing any suggestion.
 *
 * @param {Object} ctx
 * @returns {Object} overlap result
 */
export function checkBillingInstructionOverlap(ctx) {
  const {
    instruction_type,
    total_order_net = 0,
    open_to_invoice_net = 0,
    previous_billing_percent = 0,
    selected_billing_block_id = null,
    requested_amount_net = 0,
    requested_new_billing_percent = 0,
    suggested_invoice_reason = '',
    suggested_invoice_instruction_text = '',
    previousInstructions = [],   // all non-cancelled instructions for this project/order
    existingInvoices = [],       // linked InvoiceRecords
    projectBlocks = [],
  } = ctx;

  const result = {
    has_overlap: false,
    overlap_severity: 'none',
    overlap_type: [],
    blocking_reasons: [],
    warnings: [],
    safe_remaining_to_invoice_net: open_to_invoice_net,
    safe_remaining_percent: total_order_net > 0 ? (open_to_invoice_net / total_order_net) * 100 : 0,
    highest_previous_billing_percent: 0,
    active_instruction_amount_net: 0,
    recommendation: 'allow',
  };

  const activeStatuses = ['draft', 'ready_for_backoffice', 'sent_to_backoffice'];
  const completedStatuses = ['invoice_created', 'paid'];

  // ── Aggregate previous instructions ────────────────────────────────────────
  const activeInstructions = previousInstructions.filter(i => activeStatuses.includes(i.status) && !i.linked_invoice_id);
  const completedInstructions = previousInstructions.filter(i => completedStatuses.includes(i.status));

  const activeInstructionAmountNet = activeInstructions.reduce((s, i) => s + (Number(i.instruction_amount_net) || 0), 0);
  result.active_instruction_amount_net = activeInstructionAmountNet;

  const highestBillingPct = previousInstructions.reduce((max, i) => {
    const pct = Number(i.new_billing_percent) || 0;
    return pct > max ? pct : max;
  }, 0);
  result.highest_previous_billing_percent = highestBillingPct;

  // Safe remaining = open_to_invoice - active uninvoiced instructions
  const safeRemaining = Math.max(0, open_to_invoice_net - activeInstructionAmountNet);
  result.safe_remaining_to_invoice_net = safeRemaining;
  result.safe_remaining_percent = total_order_net > 0 ? (safeRemaining / total_order_net) * 100 : 0;

  let severity = 'none';
  const setSeverity = (s) => {
    const order = ['none', 'low', 'medium', 'high', 'critical'];
    if (order.indexOf(s) > order.indexOf(severity)) severity = s;
  };

  // ── 1. Draft instruction already exists ─────────────────────────────────────
  const draftExists = previousInstructions.some(i => i.status === 'draft');
  if (draftExists) {
    result.overlap_type.push('draft_exists');
    result.warnings.push('Es existiert bereits eine Entwurfs-Abrechnungsanweisung für dieses Projekt. Bitte prüfen.');
    setSeverity('low');
  }

  // ── 2. Sent to backoffice ─────────────────────────────────────────────────
  const sentExists = previousInstructions.some(i => i.status === 'sent_to_backoffice');
  if (sentExists) {
    result.overlap_type.push('sent_to_backoffice_exists');
    result.warnings.push('Es gibt eine bereits ans Backoffice gesendete Anweisung. Neue Anweisung erst nach Klärung erstellen.');
    setSeverity('medium');
  }

  // ── 3. Percentage range overlap ──────────────────────────────────────────────
  if (instruction_type === 'percentage_based' && requested_new_billing_percent > 0) {
    if (requested_new_billing_percent <= highestBillingPct) {
      result.overlap_type.push('same_percentage_range');
      result.blocking_reasons.push(
        `Dieser Abrechnungsstand (${Math.round(requested_new_billing_percent)}%) wurde bereits in einer früheren Anweisung erreicht oder überschritten (höchster Stand: ${Math.round(highestBillingPct)}%).`
      );
      setSeverity('critical');
    } else if (requested_new_billing_percent - previous_billing_percent > result.safe_remaining_percent + 5) {
      result.overlap_type.push('amount_exceeds_remaining_after_instructions');
      result.warnings.push(
        `Der gewünschte Abrechnungsanteil überschreitet den sicher verfügbaren Betrag nach Berücksichtigung bestehender Anweisungen.`
      );
      setSeverity('high');
    }
  }

  // ── 4. Order fully instructed ────────────────────────────────────────────────
  if (safeRemaining <= 0 && activeInstructionAmountNet > 0) {
    result.overlap_type.push('order_already_fully_instructed');
    result.blocking_reasons.push(
      `Der gesamte offene Abrechnungsbetrag ist bereits durch bestehende Anweisungen abgedeckt (${fmtEur(activeInstructionAmountNet)} in aktiven Anweisungen).`
    );
    setSeverity('critical');
  }

  // ── 5. Package-based checks ──────────────────────────────────────────────────
  if (instruction_type === 'package_based' && selected_billing_block_id) {
    const block = projectBlocks.find(b => b.id === selected_billing_block_id);
    const blockActiveInstructions = activeInstructions.filter(i => i.billing_block_id === selected_billing_block_id);
    const blockInvoicedAmount = existingInvoices
      .filter(i => i.billing_block_id === selected_billing_block_id && !i.is_credit_note)
      .reduce((s, i) => s + (Number(i.net_amount) || 0), 0);

    if (blockActiveInstructions.length > 0) {
      result.overlap_type.push('same_block_active_instruction');
      result.blocking_reasons.push(
        `Für dieses Leistungspaket existiert bereits eine offene Abrechnungsanweisung (Status: ${blockActiveInstructions[0].status}).`
      );
      setSeverity('critical');
    }

    if (block && blockInvoicedAmount >= (Number(block.amount_net) || 0) * 0.99) {
      result.overlap_type.push('block_already_fully_instructed');
      result.blocking_reasons.push('Dieses Leistungspaket wurde bereits vollständig abgerechnet.');
      setSeverity('critical');
    }
  }

  // ── 6. Manual amount exceeds safe remaining ───────────────────────────────────
  if (instruction_type === 'manual_amount' && requested_amount_net > 0) {
    if (requested_amount_net > safeRemaining) {
      result.overlap_type.push('amount_exceeds_remaining_after_instructions');
      if (safeRemaining <= 0) {
        result.blocking_reasons.push(
          `Der offene abrechenbare Betrag ist bereits durch bestehende Anweisungen abgedeckt.`
        );
        setSeverity('critical');
      } else {
        result.warnings.push(
          `Der Betrag (${fmtEur(requested_amount_net)}) überschreitet den sicher verbleibenden Betrag (${fmtEur(safeRemaining)}) nach Abzug bestehender Anweisungen.`
        );
        setSeverity('high');
      }
    }
  }

  // ── 7. Reason/text similarity check ──────────────────────────────────────────
  if (suggested_invoice_reason || suggested_invoice_instruction_text) {
    const normalizeText = (t) => (t || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const currentReasonNorm = normalizeText(suggested_invoice_reason);
    const currentTextNorm = normalizeText(suggested_invoice_instruction_text);

    for (const prev of previousInstructions) {
      const prevReasonNorm = normalizeText(prev.invoice_reason);
      const prevTextNorm = normalizeText(prev.invoice_instruction_text);
      if (!prevReasonNorm && !prevTextNorm) continue;

      // Exact match
      const reasonExact = currentReasonNorm && prevReasonNorm && currentReasonNorm === prevReasonNorm;
      const textExact = currentTextNorm && prevTextNorm && currentTextNorm === prevTextNorm;

      // Amount similarity ±5%
      const prevAmt = Number(prev.instruction_amount_net) || 0;
      const amountSimilar = prevAmt > 0 && requested_amount_net > 0 &&
        Math.abs(prevAmt - requested_amount_net) / prevAmt < 0.05;

      if (reasonExact || textExact || amountSimilar) {
        if (!result.overlap_type.includes('duplicate_reason')) {
          result.overlap_type.push('duplicate_reason');
          result.warnings.push(
            'Der vorgeschlagene Abrechnungsgrund ähnelt einer früheren Anweisung. Bitte prüfen, ob dies wirklich ein neuer Leistungsstand ist.'
          );
          setSeverity('medium');
        }
        break;
      }
    }
  }

  // ── Finalize ────────────────────────────────────────────────────────────────
  result.overlap_severity = severity;
  result.has_overlap = severity !== 'none';

  if (result.blocking_reasons.length > 0) {
    result.recommendation = 'block';
  } else if (severity === 'high' || severity === 'medium') {
    result.recommendation = 'warn';
  } else if (severity === 'low') {
    result.recommendation = 'warn';
  } else {
    result.recommendation = 'allow';
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