/**
 * LLM Billing Suggestion Context Builder — V1
 *
 * Builds the structured context object passed to InvokeLLM for billing suggestions.
 * Also exports the response JSON schema and the system prompt.
 */

/**
 * buildBillingSuggestionLLMContext
 *
 * Assembles all available financial, operational, and safety data
 * into a single context object for the LLM prompt.
 */
export function buildBillingSuggestionLLMContext({
  project,
  confirmedOrders = [],
  billingBlocks = [],
  invoiceRecords = [],
  wizardState = {},
  deterministicSuggestion = null,
  overlapAssessment = null,
  previousInstructionsSummary = {},
  previousInstructionItems = [],
  sourceSnapshot = null,
}) {
  const {
    instructionType,
    selectedBlock,
    form = {},
    totalOrderNet = 0,
    totalOrderGross = 0,
    alreadyInvoicedNet = 0,
    alreadyPaidGross = 0,
    openToInvoiceNet = 0,
    openReceivableGross = 0,
    prevBillingPercent = 0,
    paymentPercent = 0,
    aworkProgress = 0,
    aworkTaskStats = null,
    unpaidInvoices = [],
    overdueInvoices = [],
    blocksSummary = {},
    aworkReadinessSignals = {},
  } = wizardState;

  const linkedOrderNums = confirmedOrders.map(o => o.order_number).filter(Boolean);
  const paymentTerms = confirmedOrders[0]?.payment_terms || null;

  const allInvoices = invoiceRecords;
  const unpaidCount = unpaidInvoices.length;
  const overdueCount = overdueInvoices.length;

  // Build blocks summary for LLM
  const blockItems = billingBlocks.map(b => ({
    id: b.id,
    title: b.title,
    amount_net: Number(b.amount_net) || 0,
    work_status: b.work_status || 'not_started',
    invoice_readiness_status: b.invoice_readiness_status || 'not_ready',
    awork_progress_percent: b.awork_progress_percent || 0,
    awork_readiness_signal: b.awork_readiness_signal || 'unknown',
    billing_month: b.billing_month || null,
    is_selected: selectedBlock?.id === b.id,
  }));

  const ctx = {
    // ── Project ──────────────────────────────────────────────────────────────
    project: {
      project_name: project?.project_name || '',
      customer_name: project?.customer || '',
      project_manager: project?.project_manager || '',
      project_status: project?.status || 'active',
      risk_status: project?.risk_status || 'none',
      notes: project?.notes || null,
      category: project?.category || null,
    },

    // ── Commercial ───────────────────────────────────────────────────────────
    commercial: {
      total_order_net: totalOrderNet,
      total_order_gross: totalOrderGross,
      payment_terms: paymentTerms,
      order_numbers: linkedOrderNums,
      linked_confirmed_orders_count: confirmedOrders.length,
    },

    // ── Financial ────────────────────────────────────────────────────────────
    financial: {
      already_invoiced_net: alreadyInvoicedNet,
      already_paid_gross: alreadyPaidGross,
      open_to_invoice_net: openToInvoiceNet,
      open_receivable_gross: openReceivableGross,
      previous_billing_percent: Math.round(prevBillingPercent * 10) / 10,
      payment_percent: Math.round(paymentPercent * 10) / 10,
      unpaid_invoices_count: unpaidCount,
      overdue_invoices_count: overdueCount,
    },

    // ── Progress ─────────────────────────────────────────────────────────────
    progress: {
      performance_percent: aworkProgress,
      awork_progress_percent: aworkProgress,
      awork_tasks_done: aworkTaskStats?.tasks_done ?? null,
      awork_tasks_total: aworkTaskStats?.tasks_total ?? null,
      awork_tasks_blocked: aworkTaskStats?.blocked_tasks ?? 0,
      awork_last_activity_at: aworkTaskStats?.last_activity_at ?? null,
      awork_readiness_signals: aworkReadinessSignals,
      blocks_summary: blocksSummary,
      block_items: blockItems,
    },

    // ── Previous Instructions ────────────────────────────────────────────────
    previous_instructions: {
      summary: previousInstructionsSummary,
      items: previousInstructionItems.map(i => ({
        id: i.id,
        status: i.status,
        amount_net: Number(i.instruction_amount_net || i.amount_net) || 0,
        additional_billing_percent: Number(i.additional_billing_percent) || 0,
        new_billing_percent: Number(i.new_billing_percent) || 0,
        billing_block_id: i.billing_block_id || null,
        invoice_type: i.invoice_type || null,
        planned_invoice_date: i.planned_invoice_date || null,
        reason_short: (i.invoice_reason || i.reason_short || '').slice(0, 120),
        has_linked_invoice: !!(i.linked_invoice_id),
        ai_generated: !!i.ai_generated,
      })),
    },

    // ── Overlap Assessment ───────────────────────────────────────────────────
    overlap_assessment: overlapAssessment
      ? {
          has_overlap: overlapAssessment.has_overlap,
          overlap_severity: overlapAssessment.overlap_severity,
          overlap_type: overlapAssessment.overlap_type,
          blocking_reasons: overlapAssessment.blocking_reasons,
          warnings: overlapAssessment.warnings,
          safe_remaining_to_invoice_net: overlapAssessment.safe_remaining_to_invoice_net,
          safe_remaining_percent: overlapAssessment.safe_remaining_percent,
          highest_previous_billing_percent: overlapAssessment.highest_previous_billing_percent,
          active_instruction_amount_net: overlapAssessment.active_instruction_amount_net,
          recommendation: overlapAssessment.recommendation,
        }
      : null,

    // ── Current Request ──────────────────────────────────────────────────────
    current_request: {
      instruction_type: instructionType || null,
      manual_amount_input: instructionType === 'manual_amount'
        ? (parseFloat(form.instruction_amount_net) || null)
        : null,
      manual_percent_input: instructionType === 'percentage_based'
        ? (parseFloat(form.additional_billing_percent) || parseFloat(form.new_billing_percent) || null)
        : null,
      selected_billing_block_id: selectedBlock?.id || null,
      selected_billing_block_title: selectedBlock?.title || null,
      current_invoice_reason: form.invoice_reason || null,
      current_invoice_instruction_text: form.invoice_instruction_text || null,
      vat_rate: Number(form.vat_rate) || 20,
    },

    // ── Deterministic Baseline ───────────────────────────────────────────────
    deterministic_baseline: deterministicSuggestion
      ? {
          suggested_additional_billing_percent: deterministicSuggestion.suggested_additional_billing_percent,
          suggested_new_billing_percent: deterministicSuggestion.suggested_new_billing_percent,
          suggested_amount_net: deterministicSuggestion.suggested_amount_net,
          confidence_score: deterministicSuggestion.confidence_score,
          confidence_level: deterministicSuggestion.confidence_level,
          calculation_basis: deterministicSuggestion.calculation_basis,
          supporting_facts: deterministicSuggestion.supporting_facts || [],
          warnings: [
            deterministicSuggestion.payment_warning,
            deterministicSuggestion.progress_warning,
            deterministicSuggestion.open_invoice_warning,
          ].filter(Boolean),
          risk_flags: deterministicSuggestion.risk_flags || [],
        }
      : null,
  };

  return ctx;
}

/**
 * LLM_BILLING_RESPONSE_SCHEMA
 *
 * JSON schema for the expected LLM output.
 * Used as response_json_schema in InvokeLLM.
 */
export const LLM_BILLING_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    suggested_instruction_type: { type: 'string' },
    suggested_invoice_type: { type: 'string' },
    suggested_additional_billing_percent: { type: 'number' },
    suggested_new_billing_percent: { type: 'number' },
    suggested_amount_net: { type: 'number' },
    suggested_amount_gross: { type: 'number' },
    suggested_invoice_reason: { type: 'string' },
    suggested_invoice_instruction_text: { type: 'string' },
    suggested_internal_note: { type: 'string' },
    confidence_score: { type: 'number' },
    confidence_level: { type: 'string' },
    calculation_basis: { type: 'string' },
    supporting_facts: { type: 'array', items: { type: 'string' } },
    risk_flags: { type: 'array', items: { type: 'string' } },
    payment_warning: { type: 'string' },
    progress_warning: { type: 'string' },
    open_invoice_warning: { type: 'string' },
    overlap_assessment: {
      type: 'object',
      properties: {
        has_overlap: { type: 'boolean' },
        severity: { type: 'string' },
        reason: { type: 'string' },
        affected_previous_instruction_ids: { type: 'array', items: { type: 'string' } },
        safe_remaining_amount: { type: 'number' },
        recommendation: { type: 'string' },
      },
    },
    text_only_recommendation: { type: 'boolean' },
  },
};

/**
 * LLM_BILLING_SYSTEM_PROMPT
 *
 * Conservative system prompt for the billing assistant.
 */
export const LLM_BILLING_SYSTEM_PROMPT = `You are a conservative commercial billing assistant for a project management and liquidity planning app used by a German-speaking digital agency.

You help project managers draft billing instructions for Backoffice.

LANGUAGE: Always respond in German. All invoice texts, reasons, notes, and messages must be in German.

RULES:
1. You must be conservative and avoid double billing at all costs.
2. You must not suggest any billing amount, percentage, reason, or package that overlaps with:
   - previous BillingInstructions (any status except cancelled)
   - active draft instructions
   - instructions sent to Backoffice
   - already created invoices
   - already paid invoices
   - already covered percentage ranges
   - already used billing packages

3. If overlap_assessment.recommendation is "block": do not suggest a new amount.
   Return suggested_amount_net = 0, suggested_additional_billing_percent = 0, confidence_level = "low", text_only_recommendation = true.
   Explain in suggested_invoice_reason why no further billing is recommended.

4. If unpaid or overdue invoices exist, reduce confidence_score and include payment_warning.

5. If project progress (performance_percent) is below billing progress (previous_billing_percent), do not suggest further amount billing unless the request is clearly contractually justified by a package or milestone.

6. Base your suggestion on all available data: awork progress, financial state, previous instructions, overlap assessment, and the deterministic baseline.

7. The deterministic_baseline is a conservative calculation you can use as reference. You may diverge from it if you have good reasoning, but must explain divergence in supporting_facts.

8. Always compute overlap_assessment yourself based on the data provided, even if overlap_assessment is already provided.

9. Confidence: 80-95 = high, 50-79 = medium, below 50 = low.

10. Always return valid JSON only, matching the provided schema exactly. No commentary outside JSON.

OUTPUT FORMAT: Return only the JSON object. No markdown, no code blocks, no explanations outside the JSON.`;

/**
 * buildLLMPrompt
 *
 * Builds the user-facing prompt string combining context.
 */
export function buildLLMPrompt(llmContext) {
  return `Erstelle eine Abrechnungsanweisung für folgendes Projekt. Analysiere alle Daten konservativ und gib einen sicheren Vorschlag zurück.

KONTEXT:
${JSON.stringify(llmContext, null, 2)}

ANWEISUNG:
Analysiere den Kontext vollständig. Prüfe insbesondere:
1. Bestehende Abrechnungsanweisungen (previous_instructions) — keine Überschneidungen
2. Overlap-Assessment — bei "block" keinen Betrag vorschlagen
3. Fortschritt vs. Abrechnung — konservativ bleiben
4. Zahlungsstatus — bei offenen Rechnungen Sicherheit reduzieren
5. Deterministische Baseline als Referenz verwenden

Antworte ausschließlich mit dem JSON-Objekt gemäß Schema.`;
}

/**
 * validateLLMResponse
 *
 * Basic validation of LLM output fields.
 * Returns { valid: boolean, errors: string[] }
 */
export function validateLLMResponse(output) {
  if (!output || typeof output !== 'object') {
    return { valid: false, errors: ['Keine gültige JSON-Antwort erhalten.'] };
  }
  const errors = [];
  if (typeof output.suggested_amount_net !== 'number') errors.push('suggested_amount_net fehlt oder ist kein Zahlenwert.');
  if (typeof output.suggested_additional_billing_percent !== 'number') errors.push('suggested_additional_billing_percent fehlt oder ist kein Zahlenwert.');
  if (!output.suggested_invoice_reason) errors.push('suggested_invoice_reason fehlt.');
  if (!output.confidence_level) errors.push('confidence_level fehlt.');
  return { valid: errors.length === 0, errors };
}