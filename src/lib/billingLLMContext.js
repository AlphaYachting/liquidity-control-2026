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
 * Builds a focused, concise prompt — avoids overloading the LLM with raw JSON.
 */
export function buildLLMPrompt(llmContext) {
  const p = llmContext.project;
  const fin = llmContext.financial;
  const com = llmContext.commercial;
  const prog = llmContext.progress;
  const det = llmContext.deterministic_baseline;
  const prev = llmContext.previous_instructions;
  const req = llmContext.current_request;
  const overlap = llmContext.overlap_assessment;

  const fmtEur = (n) => n != null ? `€ ${Number(n).toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
  const fmtPct = (n) => n != null ? `${Math.round(Number(n))}%` : '—';

  const lines = [
    `Du bist ein Abrechnungsassistent für eine Digitalagentur. Erstelle eine konservative Abrechnungsempfehlung auf Deutsch.`,
    ``,
    `PROJEKT: ${p.project_name} | Kunde: ${p.customer_name} | PM: ${p.project_manager} | Status: ${p.project_status} | Risiko: ${p.risk_status}`,
    ``,
    `FINANZEN:`,
    `  Auftragswert netto: ${fmtEur(com.total_order_net)}`,
    `  Bereits abgerechnet netto: ${fmtEur(fin.already_invoiced_net)} (${fmtPct(fin.previous_billing_percent)})`,
    `  Bereits bezahlt brutto: ${fmtEur(fin.already_paid_gross)} (${fmtPct(fin.payment_percent)})`,
    `  Noch offen netto: ${fmtEur(com.total_order_net - fin.already_invoiced_net)}`,
    `  Offene/überfällige Rechnungen: ${fin.unpaid_invoices_count} offen, ${fin.overdue_invoices_count} überfällig`,
    ``,
    `PROJEKTFORTSCHRITT:`,
    `  awork Fortschritt: ${fmtPct(prog.awork_progress_percent)}`,
    `  awork Aufgaben: ${prog.awork_tasks_done ?? '?'} / ${prog.awork_tasks_total ?? '?'} erledigt, ${prog.awork_tasks_blocked ?? 0} blockiert`,
    ``,
    `AKTUELLE ANFRAGE: Typ = ${req.instruction_type}, Betrag = ${fmtEur(req.manual_amount_input)}, Prozent = ${fmtPct(req.manual_percent_input)}`,
    req.selected_billing_block_title ? `  Ausgewähltes Paket: ${req.selected_billing_block_title}` : '',
    ``,
    `DETERMINISTISCHER VORSCHLAG (Referenz):`,
    det ? [
      `  Betrag netto: ${fmtEur(det.suggested_amount_net)}`,
      `  Zusätzliche %: ${fmtPct(det.suggested_additional_billing_percent)}`,
      `  Sicherheit: ${det.confidence_level} (${det.confidence_score}%)`,
      `  Basis: ${det.calculation_basis}`,
      det.warnings?.length ? `  Warnungen: ${det.warnings.join('; ')}` : '',
    ].filter(Boolean).join('\n') : '  Kein deterministischer Vorschlag.',
    ``,
    `ÜBERLAPPUNGSPRÜFUNG:`,
    overlap ? [
      `  Empfehlung: ${overlap.recommendation} | Schwere: ${overlap.overlap_severity}`,
      `  Sicher verfügbar netto: ${fmtEur(overlap.safe_remaining_to_invoice_net)}`,
      `  Höchster bisheriger Stand: ${fmtPct(overlap.highest_previous_billing_percent)}`,
      overlap.blocking_reasons?.length ? `  Gründe: ${overlap.blocking_reasons.join('; ')}` : '',
    ].filter(Boolean).join('\n') : '  Keine Überlappungsprüfung.',
    ``,
    `BISHERIGE ABRECHNUNGSANWEISUNGEN (${prev.items?.length ?? 0} gesamt):`,
    prev.items?.length > 0 ? prev.items.map(i =>
      `  - ${i.status}: ${fmtEur(i.amount_net)} (${fmtPct(i.additional_billing_percent)} zusätzlich, neuer Stand ${fmtPct(i.new_billing_percent)}) | Grund: ${i.reason_short || '—'}`
    ).join('\n') : '  Keine bisherigen Anweisungen.',
    ``,
    `LEISTUNGSPAKETE (${prog.block_items?.length ?? 0} Stück):`,
    prog.block_items?.length > 0 ? prog.block_items.map(b =>
      `  - ${b.title}: ${fmtEur(b.amount_net)}, Status: ${b.work_status}, awork: ${fmtPct(b.awork_progress_percent)}, Bereitschaft: ${b.awork_readiness_signal}`
    ).join('\n') : '  Keine Pakete.',
    ``,
    `AUFGABE:`,
    `Analysiere die Situation und erstelle eine Abrechnungsempfehlung. Achte besonders auf:`,
    `1. Überlappungsprüfung — bei "block": keinen Betrag vorschlagen (text_only_recommendation=true, suggested_amount_net=0)`,
    `2. Bisherige Anweisungen — prüfe genau welche Bereiche bereits abgedeckt sind`,
    `3. Fortschritt vs. Abrechnung — konservativ bleiben, nicht mehr abrechnen als geleistet`,
    `4. Offene Rechnungen — Sicherheit reduzieren wenn offene/überfällige Rechnungen existieren`,
    `5. Schreibe suggested_invoice_reason und suggested_invoice_instruction_text IMMER auf Deutsch, professionell und konkret`,
    ``,
    `WICHTIG: suggested_invoice_reason und suggested_invoice_instruction_text MÜSSEN immer ausgefüllt sein!`,
    `Bei "block": erkläre im reason warum nicht abgerechnet werden kann.`,
    `Bei normalem Vorschlag: erkläre konkret was abgerechnet wird und warum (Fortschritt, Meilenstein, Paket).`,
    ``,
    `Antworte NUR mit dem JSON-Objekt, ohne Markdown oder Kommentare.`,
  ];

  return lines.filter(l => l !== undefined).join('\n');
}

/**
 * validateLLMResponse
 *
 * Validates and normalises LLM output. Coerces numeric strings and nulls.
 * Returns { valid: boolean, errors: string[], output: object }
 */
export function validateLLMResponse(raw) {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Keine gültige JSON-Antwort erhalten.'], output: null };
  }

  // Unwrap if nested (e.g. { data: { ... } } or { result: { ... } })
  const output = (raw.suggested_amount_net !== undefined || raw.suggested_invoice_reason !== undefined)
    ? raw
    : (raw.data || raw.result || raw);

  if (!output || typeof output !== 'object') {
    return { valid: false, errors: ['Keine gültige JSON-Antwort erhalten.'], output: null };
  }

  // Coerce numeric fields — LLM sometimes returns strings or null
  const numFields = [
    'suggested_amount_net', 'suggested_amount_gross',
    'suggested_additional_billing_percent', 'suggested_new_billing_percent',
    'confidence_score',
  ];
  for (const f of numFields) {
    if (output[f] === null || output[f] === undefined) {
      output[f] = 0;
    } else {
      output[f] = parseFloat(output[f]) || 0;
    }
  }

  // Coerce string fields
  const strFields = ['suggested_invoice_reason', 'suggested_invoice_instruction_text', 'suggested_internal_note', 'confidence_level', 'calculation_basis'];
  for (const f of strFields) {
    if (!output[f] || output[f] === null) output[f] = '';
  }

  // Coerce arrays
  if (!Array.isArray(output.supporting_facts)) output.supporting_facts = [];
  if (!Array.isArray(output.risk_flags)) output.risk_flags = [];

  // Null-safe optional fields
  output.payment_warning = output.payment_warning || null;
  output.progress_warning = output.progress_warning || null;
  output.open_invoice_warning = output.open_invoice_warning || null;
  output.text_only_recommendation = !!output.text_only_recommendation;

  // Default confidence_level if missing or invalid
  const validLevels = ['low', 'medium', 'high'];
  if (!validLevels.includes(output.confidence_level)) {
    const score = output.confidence_score || 0;
    output.confidence_level = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
  }

  // If invoice_reason is still empty, generate a fallback so we don't hard-block
  if (!output.suggested_invoice_reason) {
    output.suggested_invoice_reason = 'Kein Abrechnungsgrund von KI angegeben – bitte manuell ergänzen.';
  }
  if (!output.suggested_invoice_instruction_text) {
    output.suggested_invoice_instruction_text = 'Kein Rechnungstext von KI angegeben – bitte manuell ergänzen.';
  }

  return { valid: true, errors: [], output };
}