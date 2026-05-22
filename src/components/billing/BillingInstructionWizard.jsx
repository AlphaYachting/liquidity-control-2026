import React, { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertTriangle, Info, ChevronRight, ChevronLeft, Lightbulb, CheckCircle2,
  X, RefreshCw, ShieldAlert, History, Sparkles, ListChecks, Loader2
} from 'lucide-react';
import { formatCurrency } from '@/lib/liquidityUtils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { generateDeterministicBillingSuggestion, checkBillingInstructionOverlap } from '@/lib/billingSuggestionUtils';
import {
  buildBillingSuggestionLLMContext,
  LLM_BILLING_RESPONSE_SCHEMA,
  LLM_BILLING_SYSTEM_PROMPT,
  buildLLMPrompt,
  validateLLMResponse,
} from '@/lib/billingLLMContext';

const BACKOFFICE_USERS = ['Anna', 'Birgit', 'Christine', 'Maria'];
const INVOICE_TYPE_LABELS = {
  advance_invoice: 'Anzahlung',
  partial_invoice: 'Teilrechnung',
  final_invoice: 'Schlussrechnung',
  correction: 'Korrektur',
  credit_note: 'Gutschrift',
};
const READINESS_LABELS = {
  not_ready: 'Nicht bereit',
  in_progress: 'In Bearbeitung',
  ready: 'Bereit',
  invoiced: 'Verrechnet',
  paid: 'Bezahlt',
};
const CONFIDENCE_CONFIG = {
  high:   { label: 'Hoch',    color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  medium: { label: 'Mittel',  color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     dot: 'bg-amber-500'   },
  low:    { label: 'Gering',  color: 'text-red-700',     bg: 'bg-red-50 border-red-200',         dot: 'bg-red-500'     },
};
const INSTRUCTION_STATUS_LABELS = {
  draft: 'Entwurf',
  ready_for_backoffice: 'Bereit',
  sent_to_backoffice: 'Gesendet',
  invoice_created: 'Rechnung erstellt',
  paid: 'Bezahlt',
  blocked: 'Blockiert',
  cancelled: 'Storniert',
};
const INSTRUCTION_STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-600',
  ready_for_backoffice: 'bg-blue-100 text-blue-700',
  sent_to_backoffice: 'bg-amber-100 text-amber-700',
  invoice_created: 'bg-emerald-100 text-emerald-700',
  paid: 'bg-emerald-200 text-emerald-800',
  blocked: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-400',
};

function ProgressBar({ value, color = 'bg-primary', label }) {
  return (
    <div className="space-y-1">
      {label && <p className="text-xs text-muted-foreground">{label}</p>}
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <p className="text-xs font-medium">{Math.round(value)}%</p>
    </div>
  );
}

// ── Overlap Check Panel ───────────────────────────────────────────────────────
function OverlapCheckPanel({ overlap }) {
  const severityConfig = {
    none:     { bg: 'bg-emerald-50 border-emerald-200', icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />, label: 'Keine Überschneidungen' },
    low:      { bg: 'bg-blue-50 border-blue-200',       icon: <Info className="w-3.5 h-3.5 text-blue-600" />,           label: 'Hinweis' },
    medium:   { bg: 'bg-amber-50 border-amber-200',     icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />, label: 'Warnung' },
    high:     { bg: 'bg-orange-50 border-orange-200',   icon: <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />,label: 'Starke Warnung' },
    critical: { bg: 'bg-red-50 border-red-200',         icon: <ShieldAlert className="w-3.5 h-3.5 text-red-600" />,     label: 'Blockiert' },
  };
  const cfg = severityConfig[overlap.overlap_severity] || severityConfig.none;
  return (
    <div className={`rounded-lg border p-3 text-xs space-y-2 ${cfg.bg}`}>
      <div className="flex items-center gap-1.5 font-medium">
        {cfg.icon}
        <span>Sicherheitsprüfung: {cfg.label}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div><span className="text-muted-foreground">Aktive Anweisungen: </span><span className="font-medium">{overlap.active_instruction_amount_net > 0 ? formatCurrency(overlap.active_instruction_amount_net) : '—'}</span></div>
        <div><span className="text-muted-foreground">Höchster Stand: </span><span className="font-medium">{Math.round(overlap.highest_previous_billing_percent)}%</span></div>
        <div><span className="text-muted-foreground">Sicher verfügbar: </span><span className={`font-medium ${overlap.safe_remaining_to_invoice_net <= 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(overlap.safe_remaining_to_invoice_net)}</span></div>
      </div>
      {overlap.blocking_reasons?.map((r, i) => (
        <div key={i} className="flex gap-1.5 p-1.5 bg-red-100 border border-red-200 rounded text-red-800">
          <ShieldAlert className="w-3 h-3 flex-shrink-0 mt-0.5 text-red-600" />
          <span>{r}</span>
        </div>
      ))}
      {overlap.warnings?.map((w, i) => (
        <div key={i} className="flex gap-1.5 text-amber-800">
          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5 text-amber-600" />
          <span>{w}</span>
        </div>
      ))}
    </div>
  );
}

// ── Previous Instructions Panel ───────────────────────────────────────────────
function PreviousInstructionsPanel({ instructions, summary }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-medium text-foreground">Bestehende Abrechnungsanweisungen</span>
          <Badge variant="outline" className="text-xs py-0">{instructions.length}</Badge>
          {summary.active_instruction_count > 0 && (
            <Badge className="text-xs py-0 bg-amber-100 text-amber-700 border-amber-200">{summary.active_instruction_count} aktiv</Badge>
          )}
        </div>
        <span className="text-muted-foreground">{expanded ? '▲' : '▼'}</span>
      </button>
      <div className="grid grid-cols-3 gap-0 border-t text-xs">
        <div className="px-3 py-1.5 border-r">
          <p className="text-muted-foreground">Offen in Anweisungen</p>
          <p className="font-semibold text-amber-600">{formatCurrency(summary.total_open_instruction_amount_net)}</p>
        </div>
        <div className="px-3 py-1.5 border-r">
          <p className="text-muted-foreground">Höchster Stand</p>
          <p className="font-semibold">{Math.round(summary.highest_previous_billing_percent)}%</p>
        </div>
        <div className="px-3 py-1.5">
          <p className="text-muted-foreground">Bereits fakturiert</p>
          <p className="font-semibold text-emerald-600">{formatCurrency(summary.total_invoiced_instruction_amount_net)}</p>
        </div>
      </div>
      {expanded && (
        <div className="border-t divide-y">
          {instructions.map(instr => (
            <div key={instr.id} className="px-3 py-2 text-xs grid grid-cols-5 gap-2 items-start">
              <div>
                <Badge className={`text-xs py-0 ${INSTRUCTION_STATUS_COLORS[instr.status] || 'bg-gray-100 text-gray-600'}`}>
                  {INSTRUCTION_STATUS_LABELS[instr.status] || instr.status}
                </Badge>
              </div>
              <div>
                <p className="font-medium">{formatCurrency(instr.instruction_amount_net)}</p>
                <p className="text-muted-foreground">{Math.round(instr.additional_billing_percent || 0)}% → {Math.round(instr.new_billing_percent || 0)}%</p>
              </div>
              <div className="text-muted-foreground">{instr.planned_invoice_date || '—'}</div>
              <div className="col-span-2 text-muted-foreground truncate">
                {(instr.invoice_reason || '').slice(0, 60) || '—'}
                {instr.linked_invoice_id && <span className="ml-1 text-emerald-600">✓ Rechnung</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Proposal Card (shared for both deterministic and LLM) ─────────────────────
function ProposalCard({
  suggestion, label, icon, isLLM = false, isDivergent = false,
  isSafetyDowngraded = false, isSafetyBlocked = false,
  onApplyAll, onApplyTextOnly, onApplyAmountOnly, onDiscard, onRegenerate,
  isLoading = false, error = null,
}) {
  const conf = CONFIDENCE_CONFIG[suggestion?.confidence_level] || CONFIDENCE_CONFIG.medium;
  const isBlocked = isSafetyBlocked || suggestion?.overlap_check?.recommendation === 'block';

  if (isLoading) {
    return (
      <div className="rounded-xl border-2 border-dashed border-muted p-6 flex items-center justify-center gap-3 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{isLLM ? 'KI analysiert...' : 'Wird berechnet...'}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-red-700">
          <ShieldAlert className="w-4 h-4" />
          <span>{isLLM ? 'KI-Antwort konnte nicht verarbeitet werden.' : 'Fehler beim Berechnen.'}</span>
        </div>
        <p className="text-xs text-red-600">{error}</p>
        <Button size="sm" variant="outline" onClick={onRegenerate} className="h-7 text-xs mt-1">
          <RefreshCw className="w-3 h-3 mr-1" /> Erneut versuchen
        </Button>
      </div>
    );
  }

  if (!suggestion) return null;

  const warnings = [
    suggestion.payment_warning,
    suggestion.progress_warning,
    suggestion.open_invoice_warning,
  ].filter(Boolean);

  return (
    <div className={`rounded-xl border-2 ${conf.bg} p-4 space-y-3`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {icon}
          <span className="text-sm font-semibold">{label}</span>
          <Badge variant="outline" className={`text-xs ${conf.color} border-current`}>
            <span className={`w-1.5 h-1.5 rounded-full ${conf.dot} mr-1 inline-block`} />
            Sicherheit: {conf.label} ({suggestion.confidence_score}%)
          </Badge>
          {isLLM && isSafetyDowngraded && (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">
              KI-Sicherheit reduziert (Regelprüfung)
            </Badge>
          )}
          {isBlocked && (
            <Badge className="text-xs bg-red-100 text-red-700 border-red-300">
              <ShieldAlert className="w-3 h-3 mr-1" /> Blockiert
            </Badge>
          )}
          {isDivergent && (
            <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-300">
              <AlertTriangle className="w-3 h-3 mr-1" /> Weicht ab
            </Badge>
          )}
        </div>
        {onDiscard && (
          <button onClick={onDiscard} className="text-muted-foreground hover:text-foreground p-1 rounded flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Divergence warning */}
      {isDivergent && (
        <div className="flex gap-2 text-xs p-2 bg-orange-50 rounded-lg border border-orange-200">
          <AlertTriangle className="w-3.5 h-3.5 text-orange-600 flex-shrink-0 mt-0.5" />
          <span className="text-orange-800">KI-Vorschlag weicht deutlich vom Regelvorschlag ab. Bitte prüfen.</span>
        </div>
      )}

      {/* Blocked */}
      {isBlocked && isLLM && isSafetyBlocked && (
        <div className="flex gap-2 text-xs p-2 bg-red-50 rounded-lg border border-red-200">
          <ShieldAlert className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
          <span className="text-red-800">KI-Vorschlag wurde durch Sicherheitsprüfung blockiert.</span>
        </div>
      )}

      {/* Safety downgraded */}
      {isLLM && isSafetyDowngraded && !isSafetyBlocked && (
        <div className="flex gap-2 text-xs p-2 bg-amber-50 rounded-lg border border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
          <span className="text-amber-800">KI-Sicherheit wurde aufgrund der Regelprüfung reduziert.</span>
        </div>
      )}

      {/* Text-only recommendation */}
      {suggestion.text_only_recommendation && (
        <div className="flex gap-2 text-xs p-2 bg-blue-50 rounded-lg border border-blue-200">
          <Info className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
          <span className="text-blue-800">Kein Betrag empfohlen. Nur Text-Übernahme verfügbar.</span>
        </div>
      )}

      {/* Amounts */}
      {(suggestion.suggested_amount_net > 0 || suggestion.suggested_additional_billing_percent > 0) && (
        <div className="grid grid-cols-3 gap-2 p-2 bg-white/60 rounded-lg text-xs">
          <div>
            <p className="text-muted-foreground">Betrag netto</p>
            <p className="font-bold text-base">{formatCurrency(suggestion.suggested_amount_net)}</p>
            {suggestion.suggested_amount_gross > 0 && (
              <p className="text-muted-foreground">{formatCurrency(suggestion.suggested_amount_gross)} brutto</p>
            )}
          </div>
          <div>
            <p className="text-muted-foreground">Zusätzlich</p>
            <p className="font-bold text-base">+{suggestion.suggested_additional_billing_percent}%</p>
          </div>
          <div>
            <p className="text-muted-foreground">Neuer Stand</p>
            <p className="font-bold text-base">{Math.round(suggestion.suggested_new_billing_percent)}%</p>
          </div>
        </div>
      )}

      {/* Warnings */}
      {warnings.map((w, i) => (
        <div key={i} className="flex gap-2 text-xs p-2 bg-white/60 rounded-lg border border-amber-300">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
          <span className="text-amber-800">{w}</span>
        </div>
      ))}

      {/* Risk flags */}
      {suggestion.risk_flags?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestion.risk_flags.map((f, i) => (
            <Badge key={i} variant="outline" className="text-xs text-red-600 border-red-300">{f}</Badge>
          ))}
        </div>
      )}

      {/* Texts */}
      {suggestion.suggested_invoice_reason && (
        <div className="text-xs space-y-1">
          <p className="text-muted-foreground font-medium">Abrechnungsgrund:</p>
          <p className="p-2 bg-white/60 rounded text-foreground leading-relaxed">{suggestion.suggested_invoice_reason}</p>
        </div>
      )}
      {suggestion.suggested_invoice_instruction_text && (
        <div className="text-xs space-y-1">
          <p className="text-muted-foreground font-medium">Rechnungstext:</p>
          <p className="p-2 bg-white/60 rounded text-foreground leading-relaxed">{suggestion.suggested_invoice_instruction_text}</p>
        </div>
      )}

      {/* Supporting facts */}
      {suggestion.supporting_facts?.length > 0 && (
        <div className="text-xs">
          <p className="text-muted-foreground font-medium mb-1">Datenbasis:</p>
          <ul className="space-y-0.5">
            {suggestion.supporting_facts.map((f, i) => (
              <li key={i} className="flex gap-1.5 text-muted-foreground">
                <span className="text-primary mt-0.5">·</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Overlap check */}
      {suggestion.overlap_check && (
        <OverlapCheckPanel overlap={suggestion.overlap_check} />
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1 border-t border-current/20">
        <Button size="sm" onClick={onApplyAll}
          disabled={isBlocked || suggestion.text_only_recommendation}
          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Alles übernehmen
        </Button>
        <Button size="sm" variant="outline" onClick={onApplyTextOnly} className="h-7 text-xs">
          Nur Text
        </Button>
        <Button size="sm" variant="outline" onClick={onApplyAmountOnly}
          disabled={isBlocked || suggestion.text_only_recommendation}
          className="h-7 text-xs disabled:opacity-40">
          Nur Betrag
        </Button>
        <Button size="sm" variant="ghost" onClick={onRegenerate} className="h-7 text-xs ml-auto">
          <RefreshCw className="w-3 h-3 mr-1" />
          Neu
        </Button>
      </div>
    </div>
  );
}

// ── Main Wizard ───────────────────────────────────────────────────────────────
export default function BillingInstructionWizard({
  open, onClose,
  project, fin, aworkTaskStats, projectBlocks,
  linkedOrders,
  previousInstructions = [],
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [instructionType, setInstructionType] = useState(null);
  const [selectedBlock, setSelectedBlock] = useState(null);

  // Suggestions: deterministic + LLM
  const [deterministicSuggestion, setDeterministicSuggestion] = useState(null);
  const [llmSuggestion, setLlmSuggestion] = useState(null);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState(null);
  const [llmSafetyBlocked, setLlmSafetyBlocked] = useState(false);
  const [llmSafetyDowngraded, setLlmSafetyDowngraded] = useState(false);
  const [activeTab, setActiveTab] = useState('deterministic'); // 'deterministic' | 'llm'

  // Applied tracking
  const [appliedSuggestionType, setAppliedSuggestionType] = useState(null); // 'deterministic' | 'llm' | null
  const [suggestionApplied, setSuggestionApplied] = useState(false);

  const [form, setForm] = useState({
    additional_billing_percent: '',
    new_billing_percent: '',
    instruction_amount_net: '',
    invoice_type: 'partial_invoice',
    invoice_reason: '',
    invoice_instruction_text: '',
    internal_note: '',
    planned_invoice_date: '',
    assigned_backoffice_user: '',
    vat_rate: 20,
    ai_generated: false,
    ai_suggestion_json: '',
    ai_applied_at: null,
    ai_applied_by: '',
    ai_modified_after_apply: false,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.BillingInstruction.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billingInstructions'] });
      onClose();
      resetWizard();
    }
  });

  function resetWizard() {
    setStep(1); setInstructionType(null); setSelectedBlock(null);
    setDeterministicSuggestion(null); setLlmSuggestion(null);
    setLlmLoading(false); setLlmError(null);
    setLlmSafetyBlocked(false); setLlmSafetyDowngraded(false);
    setActiveTab('deterministic');
    setAppliedSuggestionType(null); setSuggestionApplied(false);
    setForm({
      additional_billing_percent: '', new_billing_percent: '', instruction_amount_net: '',
      invoice_type: 'partial_invoice', invoice_reason: '', invoice_instruction_text: '',
      internal_note: '', planned_invoice_date: '', assigned_backoffice_user: '', vat_rate: 20,
      ai_generated: false, ai_suggestion_json: '', ai_applied_at: null,
      ai_applied_by: '', ai_modified_after_apply: false,
    });
  }

  // ── Financials ──────────────────────────────────────────────────────────────
  const totalOrderNet = fin?.commercialBaseNet || 0;
  const totalOrderGross = totalOrderNet * (1 + (Number(form.vat_rate) || 20) / 100);
  const alreadyInvoicedNet = fin?.adjustedInvoicedNet || 0;
  const alreadyPaidGross = fin?.paidGross || 0;
  const openToInvoiceNet = fin?.openToInvoiceNet || 0;
  const openReceivableGross = fin?.openReceivableGross || 0;
  const prevBillingPercent = totalOrderNet > 0 ? (alreadyInvoicedNet / totalOrderNet) * 100 : 0;
  const paymentPercent = totalOrderGross > 0 ? (alreadyPaidGross / totalOrderGross) * 100 : 0;
  const aworkProgress = aworkTaskStats?.progress_percent ?? project?.awork_progress_percent ?? 0;
  const hasAworkData = aworkProgress > 0;
  const allInvoices = fin?.linkedInvoices || [];
  const unpaidInvoices = allInvoices.filter(i => i.payment_status === 'open' || i.payment_status === 'overdue');
  const overdueInvoices = allInvoices.filter(i => i.payment_status === 'overdue');

  const blocksSummary = useMemo(() => ({
    total_blocks: projectBlocks.length,
    ready_blocks: projectBlocks.filter(b => b.invoice_readiness_status === 'ready').length,
    in_progress_blocks: projectBlocks.filter(b => b.work_status === 'in_progress').length,
    blocked_blocks: projectBlocks.filter(b => b.work_status === 'blocked').length,
    completed_blocks: projectBlocks.filter(b => b.work_status === 'completed').length,
  }), [projectBlocks]);

  const aworkTasksBlocked = aworkTaskStats?.blocked_tasks ?? 0;
  const aworkReadinessSignals = useMemo(() => {
    const signals = {};
    projectBlocks.forEach(b => {
      if (b.awork_readiness_signal) signals[b.awork_readiness_signal] = (signals[b.awork_readiness_signal] || 0) + 1;
    });
    return signals;
  }, [projectBlocks]);

  const getBlockRemaining = (block) => {
    const bInvoiced = allInvoices
      .filter(i => i.billing_block_id === block.id && !i.is_credit_note)
      .reduce((s, i) => s + (Number(i.net_amount) || 0), 0);
    return Math.max(0, (Number(block.amount_net) || 0) - bInvoiced);
  };

  const derivedAmountNet = useMemo(() => {
    if (instructionType !== 'percentage_based') return 0;
    const add = parseFloat(form.additional_billing_percent);
    const nw = parseFloat(form.new_billing_percent);
    if (!isNaN(add) && add > 0) return (totalOrderNet * add) / 100;
    if (!isNaN(nw) && nw > prevBillingPercent) return (totalOrderNet * (nw - prevBillingPercent)) / 100;
    return 0;
  }, [form.additional_billing_percent, form.new_billing_percent, instructionType, totalOrderNet, prevBillingPercent]);

  const finalAmountNet = useMemo(() => {
    if (instructionType === 'package_based' && selectedBlock) return getBlockRemaining(selectedBlock) || Number(selectedBlock.amount_net);
    if (instructionType === 'percentage_based') return derivedAmountNet;
    return parseFloat(form.instruction_amount_net) || 0;
  }, [instructionType, selectedBlock, derivedAmountNet, form.instruction_amount_net]);

  const finalAmountGross = finalAmountNet * (1 + (Number(form.vat_rate) || 20) / 100);
  const newBillingPercentCalc = totalOrderNet > 0 ? ((alreadyInvoicedNet + finalAmountNet) / totalOrderNet) * 100 : 0;
  const remainingAfter = openToInvoiceNet - finalAmountNet;

  // ── Previous instructions ───────────────────────────────────────────────────
  const activePreviousInstructions = useMemo(() =>
    previousInstructions.filter(i => i.status !== 'cancelled'),
  [previousInstructions]);

  const previousInstructionsSummary = useMemo(() => {
    const activeStatuses = ['draft', 'ready_for_backoffice', 'sent_to_backoffice'];
    const active = activePreviousInstructions.filter(i => activeStatuses.includes(i.status) && !i.linked_invoice_id);
    const invoiced = activePreviousInstructions.filter(i => ['invoice_created', 'paid'].includes(i.status));
    return {
      total_previous_instruction_amount_net: activePreviousInstructions.reduce((s, i) => s + (Number(i.instruction_amount_net) || 0), 0),
      total_open_instruction_amount_net: active.reduce((s, i) => s + (Number(i.instruction_amount_net) || 0), 0),
      total_invoiced_instruction_amount_net: invoiced.reduce((s, i) => s + (Number(i.instruction_amount_net) || 0), 0),
      highest_previous_billing_percent: activePreviousInstructions.reduce((max, i) => Math.max(max, Number(i.new_billing_percent) || 0), 0),
      active_instruction_count: active.length,
      draft_instruction_count: activePreviousInstructions.filter(i => i.status === 'draft').length,
      ready_for_backoffice_count: activePreviousInstructions.filter(i => i.status === 'ready_for_backoffice').length,
      sent_to_backoffice_count: activePreviousInstructions.filter(i => i.status === 'sent_to_backoffice').length,
      invoice_created_count: activePreviousInstructions.filter(i => i.status === 'invoice_created').length,
      paid_count: activePreviousInstructions.filter(i => i.status === 'paid').length,
    };
  }, [activePreviousInstructions]);

  // ── Warnings ────────────────────────────────────────────────────────────────
  const warnings = [];
  if (!totalOrderNet) warnings.push('Kein bestätigter Auftragswert vorhanden. Bitte Auftragsbestätigung verknüpfen.');
  if (finalAmountNet > openToInvoiceNet && openToInvoiceNet > 0)
    warnings.push('Diese Anweisung überschreitet den offenen abrechenbaren Betrag.');
  if (newBillingPercentCalc > 100) warnings.push('Der Abrechnungsstand würde 100 % überschreiten.');
  if (instructionType === 'percentage_based') {
    const reqPercent = parseFloat(form.additional_billing_percent) || parseFloat(form.new_billing_percent) - prevBillingPercent || 0;
    if (aworkProgress > 0 && reqPercent > aworkProgress + 10)
      warnings.push(`Gewünschter Abrechnungsstand liegt über dem erkannten Leistungsfortschritt (awork: ${Math.round(aworkProgress)}%).`);
  }
  if (unpaidInvoices.length > 0)
    warnings.push(`Es sind ${unpaidInvoices.length} offene/überfällige Rechnung(en) vorhanden. Bitte prüfen.`);
  if (step === 3 && !form.invoice_reason) warnings.push('Kein Abrechnungsgrund angegeben.');
  if (step === 3 && !form.invoice_instruction_text) warnings.push('Kein Rechnungstext / Anweisung angegeben.');

  // ── AI disabled check ─────────────────────────────────────────────────────
  const aiDisabledReason = useMemo(() => {
    if (!totalOrderNet) return 'Kein Auftragswert vorhanden.';
    if (!linkedOrders?.length) return 'Keine Auftragsbestätigung verknüpft.';
    if (openToInvoiceNet <= 0) return 'Kein offener abrechenbarer Betrag vorhanden.';
    return null;
  }, [totalOrderNet, linkedOrders, openToInvoiceNet]);

  // ── Build overlap context ─────────────────────────────────────────────────
  function buildOverlapCtx(amountNet, newPct, reason, text) {
    return {
      instruction_type: instructionType,
      total_order_net: totalOrderNet,
      open_to_invoice_net: openToInvoiceNet,
      previous_billing_percent: prevBillingPercent,
      selected_billing_block_id: selectedBlock?.id || null,
      requested_amount_net: amountNet,
      requested_new_billing_percent: newPct,
      suggested_invoice_reason: reason,
      suggested_invoice_instruction_text: text,
      previousInstructions: activePreviousInstructions,
      existingInvoices: allInvoices,
      projectBlocks,
    };
  }

  // ── DETERMINISTIC suggestion ──────────────────────────────────────────────
  function handleGenerateDeterministic() {
    const vatRate = Number(form.vat_rate) || 20;
    const reqNewPct = parseFloat(form.new_billing_percent) || 0;
    const reqAddPct = parseFloat(form.additional_billing_percent) || 0;
    const requestedAmountNet = instructionType === 'manual_amount' ? (parseFloat(form.instruction_amount_net) || 0) : 0;

    const ctx = {
      instruction_type: instructionType,
      total_order_net: totalOrderNet,
      total_order_gross: totalOrderGross,
      already_invoiced_net: alreadyInvoicedNet,
      already_paid_gross: alreadyPaidGross,
      open_to_invoice_net: openToInvoiceNet,
      open_receivable_gross: openReceivableGross,
      previous_billing_percent: prevBillingPercent,
      payment_percent: paymentPercent,
      performance_percent: aworkProgress,
      unpaid_invoices_count: unpaidInvoices.length,
      overdue_invoices_count: overdueInvoices.length,
      awork_tasks_blocked: aworkTasksBlocked,
      project_risk_status: project?.risk_status || 'none',
      manual_amount_input: requestedAmountNet || null,
      manual_percent_input: reqAddPct || null,
      vat_rate: vatRate,
      customer_name: project?.customer || '',
      project_name: project?.project_name || '',
      has_awork_data: hasAworkData,
    };

    const suggestion = generateDeterministicBillingSuggestion(ctx);

    const overlap = checkBillingInstructionOverlap(buildOverlapCtx(
      suggestion.suggested_amount_net,
      suggestion.suggested_new_billing_percent,
      suggestion.suggested_invoice_reason,
      suggestion.suggested_invoice_instruction_text,
    ));
    suggestion.overlap_check = overlap;

    if (overlap.recommendation === 'block') {
      suggestion.confidence_level = 'low';
      suggestion.confidence_score = Math.min(suggestion.confidence_score, 10);
      suggestion.suggested_amount_net = 0;
      suggestion.suggested_amount_gross = null;
      suggestion.suggested_additional_billing_percent = 0;
      suggestion.suggested_new_billing_percent = prevBillingPercent;
      suggestion.risk_flags.push('overlap_blocked');
    } else if (overlap.recommendation === 'warn') {
      suggestion.confidence_score = Math.max(5, suggestion.confidence_score - 20);
      suggestion.confidence_level = suggestion.confidence_score >= 70 ? 'high' : suggestion.confidence_score >= 40 ? 'medium' : 'low';
    }

    setDeterministicSuggestion(suggestion);
    setActiveTab('deterministic');
  }

  // ── LLM suggestion ────────────────────────────────────────────────────────
  async function handleGenerateLLM() {
    setLlmError(null);
    setLlmSuggestion(null);
    setLlmSafetyBlocked(false);
    setLlmSafetyDowngraded(false);
    setLlmLoading(true);
    setActiveTab('llm');

    // Ensure deterministic suggestion is available first
    let detSuggestion = deterministicSuggestion;
    if (!detSuggestion) {
      const vatRate = Number(form.vat_rate) || 20;
      const reqAddPct = parseFloat(form.additional_billing_percent) || 0;
      const requestedAmountNet = instructionType === 'manual_amount' ? (parseFloat(form.instruction_amount_net) || 0) : 0;
      const ctx = {
        instruction_type: instructionType, total_order_net: totalOrderNet, total_order_gross: totalOrderGross,
        already_invoiced_net: alreadyInvoicedNet, already_paid_gross: alreadyPaidGross,
        open_to_invoice_net: openToInvoiceNet, open_receivable_gross: openReceivableGross,
        previous_billing_percent: prevBillingPercent, payment_percent: paymentPercent,
        performance_percent: aworkProgress, unpaid_invoices_count: unpaidInvoices.length,
        overdue_invoices_count: overdueInvoices.length, awork_tasks_blocked: aworkTasksBlocked,
        project_risk_status: project?.risk_status || 'none',
        manual_amount_input: requestedAmountNet || null, manual_percent_input: reqAddPct || null,
        vat_rate: vatRate, customer_name: project?.customer || '',
        project_name: project?.project_name || '', has_awork_data: hasAworkData,
      };
      detSuggestion = generateDeterministicBillingSuggestion(ctx);
      const detOverlap = checkBillingInstructionOverlap(buildOverlapCtx(
        detSuggestion.suggested_amount_net, detSuggestion.suggested_new_billing_percent,
        detSuggestion.suggested_invoice_reason, detSuggestion.suggested_invoice_instruction_text,
      ));
      detSuggestion.overlap_check = detOverlap;
      setDeterministicSuggestion(detSuggestion);
    }

    // If overlap = block, only allow text-only LLM call
    const overlapRec = detSuggestion?.overlap_check?.recommendation || 'allow';

    const llmCtx = buildBillingSuggestionLLMContext({
      project,
      confirmedOrders: linkedOrders || [],
      billingBlocks: projectBlocks || [],
      invoiceRecords: allInvoices || [],
      wizardState: {
        instructionType, selectedBlock, form,
        totalOrderNet, totalOrderGross,
        alreadyInvoicedNet, alreadyPaidGross,
        openToInvoiceNet, openReceivableGross,
        prevBillingPercent, paymentPercent,
        aworkProgress, aworkTaskStats,
        unpaidInvoices, overdueInvoices,
        blocksSummary, aworkReadinessSignals,
      },
      deterministicSuggestion: detSuggestion,
      overlapAssessment: detSuggestion?.overlap_check || null,
      previousInstructionsSummary,
      previousInstructionItems: activePreviousInstructions,
      sourceSnapshot: null,
    });

    try {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: buildLLMPrompt(llmCtx),
        response_json_schema: LLM_BILLING_RESPONSE_SCHEMA,
        model: 'claude_sonnet_4_6',
      });

      const output = typeof response === 'string' ? JSON.parse(response) : response;
      const { valid, errors } = validateLLMResponse(output);
      if (!valid) {
        setLlmError(`KI-Antwort konnte nicht verarbeitet werden: ${errors.join(' ')}`);
        setLlmLoading(false);
        return;
      }

      // Task 5: validate LLM output against deterministic safety
      const llmOverlap = checkBillingInstructionOverlap(buildOverlapCtx(
        output.suggested_amount_net,
        output.suggested_new_billing_percent,
        output.suggested_invoice_reason,
        output.suggested_invoice_instruction_text,
      ));
      output.overlap_check = llmOverlap;

      let safetyBlocked = false;
      let safetyDowngraded = false;

      // Block if overlap says block
      if (llmOverlap.recommendation === 'block') {
        output.suggested_amount_net = 0;
        output.suggested_amount_gross = 0;
        output.suggested_additional_billing_percent = 0;
        output.suggested_new_billing_percent = prevBillingPercent;
        output.text_only_recommendation = true;
        output.confidence_level = 'low';
        output.confidence_score = Math.min(output.confidence_score || 10, 10);
        safetyBlocked = true;
      }

      // Block if amount > safe remaining
      if (!safetyBlocked && output.suggested_amount_net > llmOverlap.safe_remaining_to_invoice_net && llmOverlap.safe_remaining_to_invoice_net > 0) {
        output.suggested_amount_net = llmOverlap.safe_remaining_to_invoice_net;
        output.suggested_amount_gross = output.suggested_amount_net * (1 + (Number(form.vat_rate) || 20) / 100);
        safetyDowngraded = true;
      }

      // Block if new_billing_percent <= highest previous
      if (!safetyBlocked && output.suggested_new_billing_percent > 0 &&
          output.suggested_new_billing_percent <= llmOverlap.highest_previous_billing_percent) {
        output.suggested_amount_net = 0;
        output.suggested_amount_gross = 0;
        output.suggested_additional_billing_percent = 0;
        output.text_only_recommendation = true;
        safetyBlocked = true;
      }

      // Downgrade if LLM high confidence but safety says warn
      if (!safetyBlocked && output.confidence_level === 'high' && llmOverlap.recommendation === 'warn') {
        output.confidence_level = 'medium';
        output.confidence_score = Math.min(output.confidence_score || 70, 65);
        safetyDowngraded = true;
      }

      setLlmSuggestion(output);
      setLlmSafetyBlocked(safetyBlocked);
      setLlmSafetyDowngraded(safetyDowngraded);
    } catch (err) {
      setLlmError(err?.message || 'KI-Antwort konnte nicht verarbeitet werden.');
    } finally {
      setLlmLoading(false);
    }
  }

  // ── Divergence check ──────────────────────────────────────────────────────
  const llmIsDivergent = useMemo(() => {
    if (!deterministicSuggestion || !llmSuggestion) return false;
    const pctDiff = Math.abs(
      (llmSuggestion.suggested_new_billing_percent || 0) -
      (deterministicSuggestion.suggested_new_billing_percent || 0)
    );
    const detAmt = deterministicSuggestion.suggested_amount_net || 0;
    const llmAmt = llmSuggestion.suggested_amount_net || 0;
    const amtDiff = detAmt > 0 ? Math.abs(llmAmt - detAmt) / detAmt : 0;
    return pctDiff > 10 || amtDiff > 0.20;
  }, [deterministicSuggestion, llmSuggestion]);

  // ── Apply handlers ────────────────────────────────────────────────────────
  function applySuggestion(suggestion, sourceType, applyMode) {
    const now = new Date().toISOString();
    const isLLM = sourceType === 'llm';
    setForm(f => {
      const next = { ...f };
      if (applyMode === 'all' || applyMode === 'amount') {
        next.additional_billing_percent = suggestion.suggested_additional_billing_percent?.toString() || '';
        next.new_billing_percent = suggestion.suggested_new_billing_percent?.toString() || '';
        if (instructionType === 'manual_amount') {
          next.instruction_amount_net = suggestion.suggested_amount_net?.toString() || '';
        }
      }
      if (applyMode === 'all' || applyMode === 'text') {
        next.invoice_reason = suggestion.suggested_invoice_reason || '';
        next.invoice_instruction_text = suggestion.suggested_invoice_instruction_text || '';
        next.internal_note = suggestion.suggested_internal_note || '';
      }
      next.ai_generated = true;
      next.ai_suggestion_json = JSON.stringify({ ...suggestion, source_type: sourceType });
      next.ai_applied_at = now;
      next.ai_applied_by = project?.project_manager || '';
      next.ai_modified_after_apply = false;
      return next;
    });
    setAppliedSuggestionType(sourceType);
    setSuggestionApplied(true);
    // Clear the used suggestion
    if (isLLM) {
      setLlmSuggestion(null);
      setLlmSafetyBlocked(false);
      setLlmSafetyDowngraded(false);
    } else {
      setDeterministicSuggestion(null);
    }
  }

  function handleFormChange(field, value) {
    setForm(f => {
      const next = { ...f, [field]: value };
      if (f.ai_generated && !f.ai_modified_after_apply) {
        const aiFields = ['additional_billing_percent', 'new_billing_percent', 'instruction_amount_net', 'invoice_reason', 'invoice_instruction_text'];
        if (aiFields.includes(field)) next.ai_modified_after_apply = true;
      }
      return next;
    });
  }

  function handleSelectBlock(block) {
    setSelectedBlock(block);
    const remaining = getBlockRemaining(block);
    const isFullyOpen = remaining >= (Number(block.amount_net) || 0) * 0.99;
    setForm(f => ({
      ...f,
      invoice_type: isFullyOpen ? 'partial_invoice' : 'final_invoice',
      invoice_reason: `Leistungspaket "${block.title}" ist abrechnungsbereit.`,
      invoice_instruction_text: block.description ? `${block.title}: ${block.description}` : block.title,
    }));
  }

  function handleNext() {
    if (step === 1 && instructionType) setStep(2);
    else if (step === 2) setStep(3);
  }
  function handleBack() {
    if (step === 3) setStep(2);
    else if (step === 2) setStep(1);
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────
  function buildSnapshot() {
    const blockInstructions = selectedBlock ? activePreviousInstructions.filter(i => i.billing_block_id === selectedBlock.id) : [];
    const blockInvoiced = selectedBlock
      ? allInvoices.filter(i => i.billing_block_id === selectedBlock.id && !i.is_credit_note).reduce((s, i) => s + (Number(i.net_amount) || 0), 0)
      : 0;
    return JSON.stringify({
      snapshot_at: new Date().toISOString(),
      total_order_net: totalOrderNet, already_invoiced_net: alreadyInvoicedNet,
      already_paid_gross: alreadyPaidGross, open_to_invoice_net: openToInvoiceNet,
      open_receivable_gross: openReceivableGross, previous_billing_percent: prevBillingPercent,
      payment_percent: paymentPercent, awork_progress_percent: aworkProgress,
      unpaid_invoices_count: unpaidInvoices.length, overdue_invoices_count: overdueInvoices.length,
      project_risk_status: project?.risk_status || 'none', project_status: project?.status || 'active',
      payment_terms: linkedOrders?.[0]?.payment_terms || null, has_awork_data: hasAworkData,
      awork_tasks_blocked: aworkTasksBlocked, awork_readiness_signals_summary: aworkReadinessSignals,
      blocks_summary: blocksSummary, instruction_type: instructionType,
      selected_billing_block_id: selectedBlock?.id || null, selected_billing_block_title: selectedBlock?.title || null,
      previous_instructions_summary: previousInstructionsSummary,
      previous_instruction_items: activePreviousInstructions.map(i => ({
        id: i.id, status: i.status, amount_net: i.instruction_amount_net,
        additional_billing_percent: i.additional_billing_percent, new_billing_percent: i.new_billing_percent,
        billing_block_id: i.billing_block_id, invoice_type: i.invoice_type,
        planned_invoice_date: i.planned_invoice_date,
        reason_short: (i.invoice_reason || '').slice(0, 80), linked_invoice_id: i.linked_invoice_id,
      })),
      block_instruction_summary: selectedBlock ? {
        block_amount_net: Number(selectedBlock.amount_net) || 0,
        previous_instruction_amount_net_for_block: blockInstructions.reduce((s, i) => s + (Number(i.instruction_amount_net) || 0), 0),
        previous_invoice_amount_net_for_block: blockInvoiced,
        remaining_block_amount_net: Math.max(0, (Number(selectedBlock.amount_net) || 0) - blockInvoiced),
        active_instruction_exists_for_block: blockInstructions.some(i => ['draft','ready_for_backoffice','sent_to_backoffice'].includes(i.status)),
      } : null,
      // Store which suggestion type was applied
      applied_suggestion_type: appliedSuggestionType,
    });
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  function handleSave(markReady) {
    const primaryOrder = linkedOrders?.[0];
    const addPct = parseFloat(form.additional_billing_percent) || 0;
    const newPct = parseFloat(form.new_billing_percent) || 0;
    const additionalPct = instructionType === 'percentage_based'
      ? (addPct || (newPct - prevBillingPercent))
      : (totalOrderNet > 0 ? (finalAmountNet / totalOrderNet) * 100 : 0);

    const payload = {
      project_id: project.id, confirmed_order_id: primaryOrder?.id || '',
      billing_block_id: selectedBlock?.id || '', customer_name: project.customer || '',
      project_name: project.project_name || '', instruction_type: instructionType,
      invoice_type: form.invoice_type, status: markReady ? 'ready_for_backoffice' : 'draft',
      total_order_net: totalOrderNet, total_order_gross: totalOrderGross,
      already_invoiced_net: alreadyInvoicedNet, already_paid_gross: alreadyPaidGross,
      open_to_invoice_net: openToInvoiceNet, previous_billing_percent: prevBillingPercent,
      new_billing_percent: newBillingPercentCalc, additional_billing_percent: additionalPct,
      instruction_amount_net: finalAmountNet, instruction_amount_gross: finalAmountGross,
      vat_rate: Number(form.vat_rate) || 20, awork_progress_percent: aworkProgress,
      performance_progress_percent: aworkProgress || 0,
      progress_basis: aworkProgress > 0 ? 'awork' : selectedBlock ? 'billing_block' : 'unknown',
      invoice_reason: form.invoice_reason, invoice_instruction_text: form.invoice_instruction_text,
      internal_note: form.internal_note, planned_invoice_date: form.planned_invoice_date || null,
      requested_by_pm: project.project_manager || '', assigned_backoffice_user: form.assigned_backoffice_user,
      source_snapshot_json: buildSnapshot(),
      ai_generated: form.ai_generated, ai_suggestion_json: form.ai_suggestion_json || null,
      ai_applied_at: form.ai_applied_at || null, ai_applied_by: form.ai_applied_by || null,
      ai_modified_after_apply: form.ai_modified_after_apply,
    };
    createMutation.mutate(payload);
  }

  // ── Suggestion section (shared for 2B + 2C) ──────────────────────────────
  function SuggestionSection() {
    const hasDet = !!deterministicSuggestion;
    const hasLlm = !!llmSuggestion || llmLoading || !!llmError;

    return (
      <div className="pt-2 border-t border-dashed border-muted-foreground/20 space-y-3">
        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 mr-auto">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-semibold">Vorschläge</span>
            {!hasAworkData && !aiDisabledReason && (
              <Badge variant="outline" className="text-xs text-muted-foreground">ohne awork-Daten</Badge>
            )}
            {suggestionApplied && !hasDet && !hasLlm && (
              <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                {appliedSuggestionType === 'llm' ? 'KI-Vorschlag' : 'Regelvorschlag'} angewendet
              </Badge>
            )}
          </div>
          {!hasDet && (
            <Button size="sm" variant="outline" onClick={handleGenerateDeterministic}
              disabled={!!aiDisabledReason} title={aiDisabledReason || ''}
              className="h-7 text-xs">
              <ListChecks className="w-3 h-3 mr-1 text-blue-500" />
              Regelvorschlag
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleGenerateLLM}
            disabled={!!aiDisabledReason || llmLoading} title={aiDisabledReason || ''}
            className="h-7 text-xs">
            {llmLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1 text-violet-500" />}
            KI-Vorschlag
          </Button>
        </div>

        {aiDisabledReason && (
          <p className="text-xs text-muted-foreground italic">{aiDisabledReason}</p>
        )}

        {/* Tab selector — only show if both exist */}
        {(hasDet && hasLlm) && (
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            <button
              onClick={() => setActiveTab('deterministic')}
              className={`flex-1 text-xs py-1 px-2 rounded-md transition-colors ${activeTab === 'deterministic' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
              <ListChecks className="w-3 h-3 inline mr-1" />
              Regelvorschlag
            </button>
            <button
              onClick={() => setActiveTab('llm')}
              className={`flex-1 text-xs py-1 px-2 rounded-md transition-colors ${activeTab === 'llm' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
              <Sparkles className="w-3 h-3 inline mr-1 text-violet-500" />
              KI-Vorschlag
            </button>
          </div>
        )}

        {/* Deterministic card */}
        {(hasDet && (activeTab === 'deterministic' || !hasLlm)) && (
          <ProposalCard
            suggestion={deterministicSuggestion}
            label="Regelvorschlag"
            icon={<ListChecks className="w-4 h-4 text-blue-500" />}
            isLLM={false}
            onApplyAll={() => applySuggestion(deterministicSuggestion, 'deterministic', 'all')}
            onApplyTextOnly={() => applySuggestion(deterministicSuggestion, 'deterministic', 'text')}
            onApplyAmountOnly={() => applySuggestion(deterministicSuggestion, 'deterministic', 'amount')}
            onDiscard={() => setDeterministicSuggestion(null)}
            onRegenerate={handleGenerateDeterministic}
          />
        )}

        {/* LLM card */}
        {(activeTab === 'llm' || (!hasDet && hasLlm)) && (
          <ProposalCard
            suggestion={llmSuggestion}
            label="KI-Vorschlag"
            icon={<Sparkles className="w-4 h-4 text-violet-500" />}
            isLLM={true}
            isDivergent={llmIsDivergent}
            isSafetyBlocked={llmSafetyBlocked}
            isSafetyDowngraded={llmSafetyDowngraded}
            isLoading={llmLoading}
            error={llmError}
            onApplyAll={() => applySuggestion(llmSuggestion, 'llm', 'all')}
            onApplyTextOnly={() => applySuggestion(llmSuggestion, 'llm', 'text')}
            onApplyAmountOnly={() => applySuggestion(llmSuggestion, 'llm', 'amount')}
            onDiscard={() => { setLlmSuggestion(null); setLlmError(null); setLlmSafetyBlocked(false); setLlmSafetyDowngraded(false); }}
            onRegenerate={handleGenerateLLM}
          />
        )}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); resetWizard(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            Abrechnungsanweisung erstellen
            <Badge variant="outline" className="text-xs font-normal">Schritt {step} / 3</Badge>
            {form.ai_generated && (
              <Badge className={`text-xs ${appliedSuggestionType === 'llm' ? 'bg-violet-100 text-violet-700 border-violet-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                {appliedSuggestionType === 'llm' ? <Sparkles className="w-3 h-3 mr-1" /> : <ListChecks className="w-3 h-3 mr-1" />}
                {appliedSuggestionType === 'llm' ? 'KI-Vorschlag' : 'Regelvorschlag'} angewendet
              </Badge>
            )}
            {form.ai_generated && form.ai_modified_after_apply && (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">bearbeitet</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex gap-2 mb-2">
          {['Typ wählen', 'Details', 'Backoffice'].map((label, i) => (
            <div key={i} className={`flex-1 h-1 rounded-full ${step > i ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>

        {/* Financial context strip */}
        <div className="grid grid-cols-4 gap-2 p-3 bg-muted/30 rounded-xl text-xs mb-2">
          <div><p className="text-muted-foreground">Auftragswert</p><p className="font-semibold">{formatCurrency(totalOrderNet)}</p></div>
          <div><p className="text-muted-foreground">Abgerechnet</p><p className="font-semibold text-emerald-600">{formatCurrency(alreadyInvoicedNet)} ({Math.round(prevBillingPercent)}%)</p></div>
          <div><p className="text-muted-foreground">Noch offen</p><p className="font-semibold text-amber-600">{formatCurrency(openToInvoiceNet)}</p></div>
          <div><p className="text-muted-foreground">awork Fortschritt</p><p className="font-semibold">{aworkProgress > 0 ? `${Math.round(aworkProgress)}%` : '—'}</p></div>
        </div>

        {/* ── STEP 1 ─────────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Welche Art von Abrechnungsanweisung?</p>
            {[
              { key: 'package_based', label: 'A. Leistungspaket abrechnen', desc: 'Ein definiertes Paket aus der Auftragsbestätigung abrechnen', disabled: projectBlocks.length === 0 },
              { key: 'percentage_based', label: 'B. Prozentuale Teilrechnung', desc: 'Einen Prozentsatz des Gesamtauftrags abrechnen' },
              { key: 'manual_amount', label: 'C. Freier Betrag', desc: 'Einen manuell eingegebenen Betrag mit eigenem Grund' },
            ].map(opt => (
              <button key={opt.key} disabled={opt.disabled} onClick={() => setInstructionType(opt.key)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  opt.disabled ? 'opacity-40 cursor-not-allowed border-border' :
                  instructionType === opt.key ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
                <p className="font-semibold text-sm">{opt.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                {opt.disabled && <p className="text-xs text-amber-600 mt-1">Keine Leistungspakete verknüpft.</p>}
              </button>
            ))}
          </div>
        )}

        {/* ── STEP 2A — Package-based ───────────────────────────────── */}
        {step === 2 && instructionType === 'package_based' && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Leistungspaket auswählen</p>
            {projectBlocks.map(block => {
              const remaining = getBlockRemaining(block);
              const isSelected = selectedBlock?.id === block.id;
              const aworkPct = block.awork_progress_percent || 0;
              return (
                <button key={block.id} onClick={() => handleSelectBlock(block)}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all ${isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{block.title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge className="text-xs bg-gray-100 text-gray-600">{READINESS_LABELS[block.invoice_readiness_status] || '—'}</Badge>
                        {block.billing_month && <span className="text-xs text-muted-foreground">{block.billing_month}</span>}
                        {aworkPct > 0 && <span className="text-xs text-blue-600">awork {aworkPct}%</span>}
                        {block.awork_readiness_signal === 'ready_candidate' && (
                          <Badge className="text-xs bg-emerald-100 text-emerald-700">Bereit (awork)</Badge>
                        )}
                      </div>
                      {block.awork_signal_reason && (
                        <p className="text-xs text-muted-foreground mt-0.5 italic">{block.awork_signal_reason}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-sm">{formatCurrency(block.amount_net)}</p>
                      <p className={`text-xs ${remaining < block.amount_net ? 'text-amber-600' : 'text-muted-foreground'}`}>
                        offen: {formatCurrency(remaining)}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
            {selectedBlock && (
              <div className="space-y-3 pt-2 border-t">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Rechnungstyp</Label>
                    <Select value={form.invoice_type} onValueChange={v => setForm(f => ({ ...f, invoice_type: v }))}>
                      <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(INVOICE_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">MwSt. %</Label>
                    <Input type="number" value={form.vat_rate} onChange={e => setForm(f => ({ ...f, vat_rate: e.target.value }))} className="h-8 text-xs mt-1" />
                  </div>
                </div>
              </div>
            )}
            <div className="p-3 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/10">
              <p className="text-xs text-muted-foreground">
                <Lightbulb className="w-3.5 h-3.5 inline mr-1" />
                KI-Textvorschlag für Leistungspakete folgt später.
              </p>
            </div>
          </div>
        )}

        {/* ── STEP 2B — Percentage-based ───────────────────────────── */}
        {step === 2 && instructionType === 'percentage_based' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-xs">
              <ProgressBar value={prevBillingPercent} color="bg-blue-500" label="Bisher abgerechnet" />
              <ProgressBar value={aworkProgress} color="bg-emerald-500" label="Leistungsfortschritt" />
              <ProgressBar value={newBillingPercentCalc} color="bg-primary" label="Nach Anweisung" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Zusätzliche % (dieser Rechnung)</Label>
                <Input type="number" min="0" max="100" placeholder="z.B. 20"
                  value={form.additional_billing_percent}
                  onChange={e => { handleFormChange('additional_billing_percent', e.target.value); setForm(f => ({ ...f, new_billing_percent: '' })); }}
                  className="h-8 text-xs mt-1" />
              </div>
              <div>
                <Label className="text-xs">Neuer Gesamtstand % (kumuliert)</Label>
                <Input type="number" min="0" max="100" placeholder="z.B. 40"
                  value={form.new_billing_percent}
                  onChange={e => { handleFormChange('new_billing_percent', e.target.value); setForm(f => ({ ...f, additional_billing_percent: '' })); }}
                  className="h-8 text-xs mt-1" />
              </div>
            </div>
            {finalAmountNet > 0 && (
              <div className="p-3 rounded-xl bg-muted/40 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Bisher abgerechnet:</span><span>{Math.round(prevBillingPercent)}% = {formatCurrency(alreadyInvoicedNet)}</span></div>
                <div className="flex justify-between font-medium"><span>Diese Rechnung:</span><span className="text-primary">{Math.round(finalAmountNet / totalOrderNet * 100)}% = {formatCurrency(finalAmountNet)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Neuer Stand:</span><span>{Math.round(newBillingPercentCalc)}%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Verbleibend danach:</span><span className={remainingAfter < 0 ? 'text-red-600' : 'text-emerald-600'}>{formatCurrency(Math.max(0, remainingAfter))}</span></div>
                <div className="flex justify-between border-t pt-1"><span className="text-muted-foreground">Brutto ({form.vat_rate}% MwSt.):</span><span className="font-bold">{formatCurrency(finalAmountGross)}</span></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Rechnungstyp</Label>
                <Select value={form.invoice_type} onValueChange={v => setForm(f => ({ ...f, invoice_type: v }))}>
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(INVOICE_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">MwSt. %</Label>
                <Input type="number" value={form.vat_rate} onChange={e => setForm(f => ({ ...f, vat_rate: e.target.value }))} className="h-8 text-xs mt-1" />
              </div>
            </div>
            {activePreviousInstructions.length > 0 && (
              <PreviousInstructionsPanel instructions={activePreviousInstructions} summary={previousInstructionsSummary} />
            )}
            <SuggestionSection />
          </div>
        )}

        {/* ── STEP 2C — Manual amount ───────────────────────────────── */}
        {step === 2 && instructionType === 'manual_amount' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Betrag netto (€) *</Label>
                <Input type="number" placeholder="0.00" value={form.instruction_amount_net}
                  onChange={e => handleFormChange('instruction_amount_net', e.target.value)}
                  className="h-8 text-xs mt-1" />
                <p className="text-xs text-muted-foreground mt-0.5">Offen: {formatCurrency(openToInvoiceNet)}</p>
              </div>
              <div>
                <Label className="text-xs">MwSt. %</Label>
                <Input type="number" value={form.vat_rate} onChange={e => setForm(f => ({ ...f, vat_rate: e.target.value }))} className="h-8 text-xs mt-1" />
              </div>
            </div>
            {finalAmountNet > 0 && (
              <div className="p-3 rounded-xl bg-muted/40 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Brutto ({form.vat_rate}% MwSt.):</span><span className="font-bold">{formatCurrency(finalAmountGross)}</span></div>
                <div className="flex justify-between mt-1"><span className="text-muted-foreground">Abrechnungsstand nach Anweisung:</span><span>{Math.round(newBillingPercentCalc)}%</span></div>
              </div>
            )}
            <div>
              <Label className="text-xs">Rechnungstyp</Label>
              <Select value={form.invoice_type} onValueChange={v => setForm(f => ({ ...f, invoice_type: v }))}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(INVOICE_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {activePreviousInstructions.length > 0 && (
              <PreviousInstructionsPanel instructions={activePreviousInstructions} summary={previousInstructionsSummary} />
            )}
            <SuggestionSection />
          </div>
        )}

        {/* ── STEP 3 — Backoffice ───────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="p-3 bg-primary/5 rounded-xl text-sm flex items-center justify-between">
              <span className="text-muted-foreground">Betrag dieser Anweisung</span>
              <div className="text-right">
                <p className="font-bold text-lg">{formatCurrency(finalAmountNet)} netto</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(finalAmountGross)} brutto · {INVOICE_TYPE_LABELS[form.invoice_type]}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Geplantes Rechnungsdatum</Label>
                <Input type="date" value={form.planned_invoice_date}
                  onChange={e => setForm(f => ({ ...f, planned_invoice_date: e.target.value }))}
                  className="h-8 text-xs mt-1" />
              </div>
              <div>
                <Label className="text-xs">Zuständig Backoffice</Label>
                <Select value={form.assigned_backoffice_user} onValueChange={v => setForm(f => ({ ...f, assigned_backoffice_user: v }))}>
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Auswählen..." /></SelectTrigger>
                  <SelectContent>
                    {BACKOFFICE_USERS.map(u => <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">
                Abrechnungsgrund *
                <span className="text-muted-foreground font-normal ml-1">(warum kann abgerechnet werden?)</span>
                {form.ai_generated && <Badge className={`ml-2 text-xs py-0 ${appliedSuggestionType === 'llm' ? 'bg-violet-100 text-violet-600 border-violet-200' : 'bg-blue-100 text-blue-600 border-blue-200'}`}>{appliedSuggestionType === 'llm' ? 'KI' : 'Regel'}</Badge>}
              </Label>
              <Textarea rows={2} value={form.invoice_reason}
                onChange={e => handleFormChange('invoice_reason', e.target.value)}
                placeholder="z.B. Meilenstein erreicht, Paket abgeschlossen..."
                className="text-xs mt-1 resize-none" />
            </div>
            <div>
              <Label className="text-xs">
                Rechnungstext / Anweisung für Backoffice *
                {form.ai_generated && <Badge className={`ml-2 text-xs py-0 ${appliedSuggestionType === 'llm' ? 'bg-violet-100 text-violet-600 border-violet-200' : 'bg-blue-100 text-blue-600 border-blue-200'}`}>{appliedSuggestionType === 'llm' ? 'KI' : 'Regel'}</Badge>}
              </Label>
              <Textarea rows={3} value={form.invoice_instruction_text}
                onChange={e => handleFormChange('invoice_instruction_text', e.target.value)}
                placeholder="Was soll auf der Rechnung stehen? Was soll erstellt werden?"
                className="text-xs mt-1 resize-none" />
            </div>
            <div>
              <Label className="text-xs">Interne Notiz (optional)</Label>
              <Textarea rows={2} value={form.internal_note}
                onChange={e => handleFormChange('internal_note', e.target.value)}
                placeholder="Nur intern sichtbar..."
                className="text-xs mt-1 resize-none" />
            </div>
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="space-y-1.5">
            {warnings.map((w, i) => (
              <Alert key={i} className="border-amber-200 bg-amber-50 py-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <AlertDescription className="text-amber-800 text-xs">{w}</AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2 border-t">
          <Button variant="outline" size="sm" onClick={step === 1 ? () => { onClose(); resetWizard(); } : handleBack}>
            <ChevronLeft className="w-3.5 h-3.5 mr-1" />
            {step === 1 ? 'Abbrechen' : 'Zurück'}
          </Button>
          <div className="flex gap-2">
            {step < 3 ? (
              <Button size="sm" onClick={handleNext}
                disabled={
                  (step === 1 && !instructionType) ||
                  (step === 2 && instructionType === 'package_based' && !selectedBlock) ||
                  (step === 2 && instructionType === 'percentage_based' && finalAmountNet <= 0) ||
                  (step === 2 && instructionType === 'manual_amount' && finalAmountNet <= 0)
                }>
                Weiter <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => handleSave(false)}
                  disabled={createMutation.isPending}>
                  Als Entwurf speichern
                </Button>
                <Button size="sm" onClick={() => handleSave(true)}
                  disabled={createMutation.isPending || !form.invoice_reason || !form.invoice_instruction_text}>
                  Bereit für Backoffice
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}