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
import { AlertTriangle, Info, ChevronRight, ChevronLeft, Lightbulb } from 'lucide-react';
import { formatCurrency } from '@/lib/liquidityUtils';
import { Alert, AlertDescription } from '@/components/ui/alert';

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

export default function BillingInstructionWizard({
  open, onClose,
  project, fin, aworkTaskStats, projectBlocks,
  linkedOrders,
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [instructionType, setInstructionType] = useState(null);
  const [selectedBlock, setSelectedBlock] = useState(null);
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
    setForm({ additional_billing_percent: '', new_billing_percent: '', instruction_amount_net: '',
      invoice_type: 'partial_invoice', invoice_reason: '', invoice_instruction_text: '',
      internal_note: '', planned_invoice_date: '', assigned_backoffice_user: '', vat_rate: 20 });
  }

  const totalOrderNet = fin?.commercialBaseNet || 0;
  const totalOrderGross = totalOrderNet * (1 + (Number(form.vat_rate) || 20) / 100);
  const alreadyInvoicedNet = fin?.adjustedInvoicedNet || 0;
  const alreadyPaidGross = fin?.paidGross || 0;
  const openToInvoiceNet = fin?.openToInvoiceNet || 0;
  const prevBillingPercent = totalOrderNet > 0 ? (alreadyInvoicedNet / totalOrderNet) * 100 : 0;

  const aworkProgress = aworkTaskStats?.progress_percent ?? project?.awork_progress_percent ?? 0;

  // Block-based remaining
  const getBlockRemaining = (block) => {
    const bInvoiced = (fin?.linkedInvoices || [])
      .filter(i => i.billing_block_id === block.id && !i.is_credit_note)
      .reduce((s, i) => s + (Number(i.net_amount) || 0), 0);
    return Math.max(0, (Number(block.amount_net) || 0) - bInvoiced);
  };

  // Derived amount from percentage inputs
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

  // Warnings
  const warnings = [];
  if (!totalOrderNet) warnings.push('Kein bestätigter Auftragswert vorhanden. Bitte Auftragsbestätigung verknüpfen.');
  if (finalAmountNet > openToInvoiceNet && openToInvoiceNet > 0)
    warnings.push('Diese Anweisung überschreitet den offenen abrechenbaren Betrag.');
  if (newBillingPercentCalc > 100)
    warnings.push('Der Abrechnungsstand würde 100 % überschreiten.');
  if (instructionType === 'percentage_based') {
    const reqPercent = parseFloat(form.additional_billing_percent) || parseFloat(form.new_billing_percent) - prevBillingPercent || 0;
    if (aworkProgress > 0 && reqPercent > aworkProgress + 10)
      warnings.push(`Gewünschter Abrechnungsstand liegt über dem erkannten Leistungsfortschritt (awork: ${Math.round(aworkProgress)}%).`);
  }
  const unpaidInvoices = (fin?.linkedInvoices || []).filter(i => i.payment_status === 'open' || i.payment_status === 'overdue');
  if (unpaidInvoices.length > 0)
    warnings.push(`Es sind ${unpaidInvoices.length} offene/überfällige Rechnung(en) vorhanden. Bitte prüfen.`);
  if (step === 3 && !form.invoice_reason)
    warnings.push('Kein Abrechnungsgrund angegeben.');
  if (step === 3 && !form.invoice_instruction_text)
    warnings.push('Kein Rechnungstext / Anweisung angegeben.');

  function handleSelectBlock(block) {
    setSelectedBlock(block);
    const remaining = getBlockRemaining(block);
    const isFullyOpen = remaining >= (Number(block.amount_net) || 0) * 0.99;
    setForm(f => ({
      ...f,
      invoice_type: isFullyOpen ? 'partial_invoice' : 'final_invoice',
      invoice_reason: `Leistungspaket "${block.title}" ist abrechnungsbereit.`,
      invoice_instruction_text: block.description
        ? `${block.title}: ${block.description}`
        : block.title,
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

  function buildSnapshot() {
    return JSON.stringify({
      snapshot_at: new Date().toISOString(),
      total_order_net: totalOrderNet,
      already_invoiced_net: alreadyInvoicedNet,
      already_paid_gross: alreadyPaidGross,
      open_to_invoice_net: openToInvoiceNet,
      previous_billing_percent: prevBillingPercent,
      awork_progress_percent: aworkProgress,
      instruction_type: instructionType,
      selected_billing_block_id: selectedBlock?.id || null,
      selected_billing_block_title: selectedBlock?.title || null,
    });
  }

  function handleSave(markReady) {
    const primaryOrder = linkedOrders?.[0];
    const addPct = parseFloat(form.additional_billing_percent) || 0;
    const newPct = parseFloat(form.new_billing_percent) || 0;
    const additionalPct = instructionType === 'percentage_based'
      ? (addPct || (newPct - prevBillingPercent))
      : (totalOrderNet > 0 ? (finalAmountNet / totalOrderNet) * 100 : 0);

    const payload = {
      project_id: project.id,
      confirmed_order_id: primaryOrder?.id || '',
      billing_block_id: selectedBlock?.id || '',
      customer_name: project.customer || '',
      project_name: project.project_name || '',
      instruction_type: instructionType,
      invoice_type: form.invoice_type,
      status: markReady ? 'ready_for_backoffice' : 'draft',
      total_order_net: totalOrderNet,
      total_order_gross: totalOrderGross,
      already_invoiced_net: alreadyInvoicedNet,
      already_paid_gross: alreadyPaidGross,
      open_to_invoice_net: openToInvoiceNet,
      previous_billing_percent: prevBillingPercent,
      new_billing_percent: newBillingPercentCalc,
      additional_billing_percent: additionalPct,
      instruction_amount_net: finalAmountNet,
      instruction_amount_gross: finalAmountGross,
      vat_rate: Number(form.vat_rate) || 20,
      awork_progress_percent: aworkProgress,
      performance_progress_percent: aworkProgress || 0,
      progress_basis: aworkProgress > 0 ? 'awork' : selectedBlock ? 'billing_block' : 'unknown',
      invoice_reason: form.invoice_reason,
      invoice_instruction_text: form.invoice_instruction_text,
      internal_note: form.internal_note,
      planned_invoice_date: form.planned_invoice_date || null,
      requested_by_pm: project.project_manager || '',
      assigned_backoffice_user: form.assigned_backoffice_user,
      source_snapshot_json: buildSnapshot(),
      ...(markReady ? { sent_to_backoffice_at: null } : {}),
    };
    createMutation.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); resetWizard(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Abrechnungsanweisung erstellen
            <Badge variant="outline" className="text-xs font-normal">Schritt {step} / 3</Badge>
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

        {/* ── STEP 1 ───────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Welche Art von Abrechnungsanweisung?</p>
            {[
              { key: 'package_based', label: 'A. Leistungspaket abrechnen', desc: 'Ein definiertes Paket aus der Auftragsbestätigung abrechnen', disabled: projectBlocks.length === 0 },
              { key: 'percentage_based', label: 'B. Prozentuale Teilrechnung', desc: 'Einen Prozentsatz des Gesamtauftrags abrechnen' },
              { key: 'manual_amount', label: 'C. Freier Betrag', desc: 'Einen manuell eingegebenen Betrag mit eigenem Grund' },
            ].map(opt => (
              <button key={opt.key} disabled={opt.disabled}
                onClick={() => setInstructionType(opt.key)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  opt.disabled ? 'opacity-40 cursor-not-allowed border-border' :
                  instructionType === opt.key ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                }`}>
                <p className="font-semibold text-sm">{opt.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                {opt.disabled && <p className="text-xs text-amber-600 mt-1">Keine Leistungspakete verknüpft.</p>}
              </button>
            ))}

            {/* AI placeholder */}
            <div className="p-3 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">KI-Vorschlag aus awork/eWork erzeugen — folgt später</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 pl-6">
                Später kann die KI aus awork-Aufgaben, erledigten Tasks und Projektfortschritt automatisch einen Abrechnungsgrund vorschlagen.
              </p>
            </div>
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
                      {remaining < block.amount_net
                        ? <p className="text-xs text-amber-600">offen: {formatCurrency(remaining)}</p>
                        : <p className="text-xs text-muted-foreground">offen: {formatCurrency(remaining)}</p>
                      }
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
                  onChange={e => setForm(f => ({ ...f, additional_billing_percent: e.target.value, new_billing_percent: '' }))}
                  className="h-8 text-xs mt-1" />
              </div>
              <div>
                <Label className="text-xs">Neuer Gesamtstand % (kumuliert)</Label>
                <Input type="number" min="0" max="100" placeholder="z.B. 40"
                  value={form.new_billing_percent}
                  onChange={e => setForm(f => ({ ...f, new_billing_percent: e.target.value, additional_billing_percent: '' }))}
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
          </div>
        )}

        {/* ── STEP 2C — Manual amount ───────────────────────────────── */}
        {step === 2 && instructionType === 'manual_amount' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Betrag netto (€) *</Label>
                <Input type="number" placeholder="0.00" value={form.instruction_amount_net}
                  onChange={e => setForm(f => ({ ...f, instruction_amount_net: e.target.value }))}
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
          </div>
        )}

        {/* ── STEP 3 — Backoffice details ───────────────────────────── */}
        {step === 3 && (
          <div className="space-y-3">
            {/* Amount summary */}
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
              <Label className="text-xs">Abrechnungsgrund * <span className="text-muted-foreground font-normal">(warum kann abgerechnet werden?)</span></Label>
              <Textarea rows={2} value={form.invoice_reason}
                onChange={e => setForm(f => ({ ...f, invoice_reason: e.target.value }))}
                placeholder="z.B. Meilenstein erreicht, Paket abgeschlossen..."
                className="text-xs mt-1 resize-none" />
            </div>

            <div>
              <Label className="text-xs">Rechnungstext / Anweisung für Backoffice *</Label>
              <Textarea rows={3} value={form.invoice_instruction_text}
                onChange={e => setForm(f => ({ ...f, invoice_instruction_text: e.target.value }))}
                placeholder="Was soll auf der Rechnung stehen? Was soll erstellt werden?"
                className="text-xs mt-1 resize-none" />
            </div>

            <div>
              <Label className="text-xs">Interne Notiz (optional)</Label>
              <Textarea rows={2} value={form.internal_note}
                onChange={e => setForm(f => ({ ...f, internal_note: e.target.value }))}
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