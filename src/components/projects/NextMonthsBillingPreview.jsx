import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/liquidityUtils';
import { format, addMonths, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Plus, CalendarDays, Bell, Pencil, CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import GenerateBillingReasonButton from '@/components/billing/GenerateBillingReasonButton';

const PLAN_TYPE_TO_INVOICE_TYPE = {
  AZ: 'advance_invoice',
  TR: 'partial_invoice',
  ER: 'final_invoice',
};

const STATUS_CFG = {
  open:                { label: 'Offen',           color: 'bg-gray-100 text-gray-600' },
  planned:             { label: 'Geplant',          color: 'bg-blue-100 text-blue-700' },
  in_review:           { label: 'In Prüfung',       color: 'bg-amber-100 text-amber-700' },
  ready_for_invoice:   { label: 'Bereit',           color: 'bg-emerald-100 text-emerald-700' },
  sent_to_backoffice:  { label: 'An BO gesendet',   color: 'bg-amber-100 text-amber-700' },
  invoiced:            { label: '✓ Verrechnet',      color: 'bg-emerald-100 text-emerald-700' },
  postponed:           { label: 'Verschoben',        color: 'bg-orange-100 text-orange-700' },
  on_hold:             { label: 'On Hold',           color: 'bg-red-100 text-red-700' },
};

const TYPE_CFG = {
  AZ: { color: 'bg-purple-100 text-purple-700' },
  TR: { color: 'bg-blue-100 text-blue-700' },
  ER: { color: 'bg-emerald-100 text-emerald-700' },
};

function getMonthStr(offset) {
  const d = addMonths(new Date(), offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(ym) {
  try { return format(parseISO(ym + '-01'), 'MMMM yyyy', { locale: de }); } catch { return ym; }
}

/**
 * Task 7: 4-month billing plan preview (current + next 3)
 * Shows planned invoices per month with inline add form.
 */
export default function NextMonthsBillingPreview({ project, fin, linkedOrders }) {
  const queryClient = useQueryClient();
  const [addingMonth, setAddingMonth] = useState(null);
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [form, setForm] = useState({});
  const [creatingInstructionForPlanId, setCreatingInstructionForPlanId] = useState(null);
  const [confirmUnlinkPlanId, setConfirmUnlinkPlanId] = useState(null);

  const { data: allInstructions = [] } = useQuery({
    queryKey: ['billingInstructions'],
    queryFn: () => base44.entities.BillingInstruction.list(),
  });

  const deleteInstructionMutation = useMutation({
    mutationFn: async ({ planId, instructionId }) => {
      await base44.entities.MonthlyBillingPlan.update(planId, { linked_billing_instruction_id: null });
      await base44.entities.BillingInstruction.delete(instructionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthlyBillingPlans', project.id] });
      queryClient.invalidateQueries({ queryKey: ['billingInstructions'] });
      setConfirmUnlinkPlanId(null);
    },
  });

  const createInstructionMutation = useMutation({
    mutationFn: ({ _planId, ...data }) => base44.entities.BillingInstruction.create(data),
    onSuccess: (newInstruction, variables) => {
      // Link the plan to the new instruction
      updateMutation.mutate({ id: variables._planId, data: { linked_billing_instruction_id: newInstruction.id } });
      queryClient.invalidateQueries({ queryKey: ['billingInstructions'] });
      setCreatingInstructionForPlanId(null);
    },
    onError: () => setCreatingInstructionForPlanId(null),
  });

  const months = [0, 1, 2, 3].map(o => getMonthStr(o));
  const labels = ['Dieser Monat', 'Nächster Monat', 'Monat +2', 'Monat +3'];

  const { data: plans = [] } = useQuery({
    queryKey: ['monthlyBillingPlans', project.id],
    queryFn: () => base44.entities.MonthlyBillingPlan.filter({ project_id: project.id }),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.MonthlyBillingPlan.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthlyBillingPlans', project.id] });
      setAddingMonth(null);
      setForm({});
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.MonthlyBillingPlan.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monthlyBillingPlans', project.id] })
  });

  const deletePlanMutation = useMutation({
    mutationFn: (planId) => base44.entities.MonthlyBillingPlan.delete(planId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monthlyBillingPlans', project.id] }),
  });

  const [confirmDeletePlanId, setConfirmDeletePlanId] = useState(null);

  const totalOrderNet = fin?.commercialBaseNet || 0;
  const vatRate = linkedOrders?.[0]?.vat_rate || 20;

  const handlePercentChange = (pct) => {
    const net = totalOrderNet > 0 ? Math.round((totalOrderNet * pct) / 100 * 100) / 100 : 0;
    const gross = Math.round(net * (1 + vatRate / 100) * 100) / 100;
    setForm(f => ({ ...f, planned_percent: pct, planned_amount_net: net, planned_amount_gross: gross }));
  };

  const handleSave = (month, planningType) => {
    const payload = {
      project_id: project.id,
      confirmed_order_id: linkedOrders?.[0]?.id || '',
      planning_month: month,
      planning_type: planningType,
      planned_invoice_type: form.planned_invoice_type || 'TR',
      planned_percent: Number(form.planned_percent) || 0,
      planned_amount_net: Number(form.planned_amount_net) || 0,
      planned_amount_gross: Number(form.planned_amount_gross) || 0,
      billing_progress_percent: totalOrderNet > 0 ? Math.round(((fin?.adjustedInvoicedNet || 0) / totalOrderNet) * 100) : 0,
      awork_progress_percent: project.awork_progress_percent || 0,
      billing_status: 'planned',
      invoice_reason: form.invoice_reason || '',
      internal_note: form.internal_note || '',
      reminder_date: form.reminder_date || null,
      reminder_reason: form.reminder_reason || '',
      reminder_status: form.reminder_date ? 'open' : null,
      assigned_pm: project.project_manager || '',
    };
    if (editingPlanId) {
      updateMutation.mutate({ id: editingPlanId, data: payload }, {
        onSuccess: () => { setEditingPlanId(null); setAddingMonth(null); setForm({}); }
      });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleCreateInstruction = (plan) => {
    setCreatingInstructionForPlanId(plan.id);
    const totalOrderNet = fin?.commercialBaseNet || 0;
    const amountNet = Number(plan.planned_amount_net) || 0;
    const vatRate = linkedOrders?.[0]?.vat_rate || 20;
    const amountGross = amountNet * (1 + vatRate / 100);
    const alreadyInvoicedNet = fin?.adjustedInvoicedNet || 0;
    const prevBillingPct = totalOrderNet > 0 ? (alreadyInvoicedNet / totalOrderNet) * 100 : 0;
    const additionalPct = totalOrderNet > 0 ? (amountNet / totalOrderNet) * 100 : 0;
    const newBillingPct = prevBillingPct + additionalPct;

    createInstructionMutation.mutate({
      _planId: plan.id, // used in onSuccess, stripped from payload below
      project_id: project.id,
      confirmed_order_id: linkedOrders?.[0]?.id || '',
      customer_name: project.customer || '',
      project_name: project.project_name || '',
      instruction_type: 'manual_amount',
      invoice_type: PLAN_TYPE_TO_INVOICE_TYPE[plan.planned_invoice_type] || 'partial_invoice',
      status: 'draft',
      total_order_net: totalOrderNet,
      total_order_gross: totalOrderNet * (1 + vatRate / 100),
      already_invoiced_net: alreadyInvoicedNet,
      open_to_invoice_net: fin?.openToInvoiceNet || 0,
      previous_billing_percent: prevBillingPct,
      new_billing_percent: newBillingPct,
      additional_billing_percent: additionalPct,
      instruction_amount_net: amountNet,
      instruction_amount_gross: amountGross,
      vat_rate: vatRate,
      invoice_reason: plan.invoice_reason || '',
      planned_invoice_date: plan.reminder_date || `${plan.planning_month}-01`,
      requested_by_pm: project.project_manager || '',
    });
  };

  const handleEdit = (plan, month) => {
    setEditingPlanId(plan.id);
    setAddingMonth(month);
    setForm({
      planned_invoice_type: plan.planned_invoice_type || 'TR',
      planned_percent: plan.planned_percent || '',
      planned_amount_net: plan.planned_amount_net || '',
      planned_amount_gross: plan.planned_amount_gross || '',
      invoice_reason: plan.invoice_reason || '',
      internal_note: plan.internal_note || '',
      reminder_date: plan.reminder_date || '',
      reminder_reason: plan.reminder_reason || '',
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" />
          Verrechnungsplanung — 4 Monate
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {months.map((month, idx) => {
          const planningType = idx === 0 ? 'current_month' : idx === 1 ? 'next_month' : 'future_month';
          const monthPlans = plans.filter(p => p.planning_month === month);
          const isAdding = addingMonth === month;

          return (
            <div key={month} className={`rounded-xl border p-3 space-y-2 ${idx === 0 ? 'border-primary/30 bg-primary/5' : idx === 1 ? 'border-amber-200 bg-amber-50/30' : 'bg-muted/10'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{labels[idx]}</span>
                  <span className="text-xs text-muted-foreground ml-2">{getMonthLabel(month)}</span>
                </div>
                {!isAdding && !editingPlanId && (
                  <Button size="sm" variant="ghost" className="h-6 text-xs"
                    onClick={() => { setAddingMonth(month); setEditingPlanId(null); setForm({ planned_invoice_type: 'TR' }); }}>
                    <Plus className="w-3 h-3 mr-0.5" /> Planung
                  </Button>
                )}
              </div>

              {/* Existing plans */}
              {monthPlans.map(plan => (
                editingPlanId === plan.id ? null :
                <div key={plan.id} className="flex items-center justify-between gap-2 p-2 bg-white/80 rounded-lg border text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`text-xs py-0 ${TYPE_CFG[plan.planned_invoice_type]?.color || 'bg-gray-100 text-gray-600'}`}>
                      {plan.planned_invoice_type}
                    </Badge>
                    <span className="font-semibold">{formatCurrency(plan.planned_amount_net)}</span>
                    {plan.planned_percent > 0 && <span className="text-muted-foreground">{Math.round(plan.planned_percent)}%</span>}
                    <Badge className={`text-xs py-0 ${STATUS_CFG[plan.billing_status]?.color || ''}`}>
                      {STATUS_CFG[plan.billing_status]?.label || plan.billing_status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {plan.reminder_date && (
                      <span className="flex items-center gap-0.5 text-amber-600">
                        <Bell className="w-3 h-3" />
                        {plan.reminder_date}
                      </span>
                    )}
                    <Select value={plan.billing_status}
                      onValueChange={v => updateMutation.mutate({ id: plan.id, data: { billing_status: v } })}>
                      <SelectTrigger className="h-6 text-xs w-32 border-0 bg-transparent shadow-none p-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_CFG).map(([v, { label }]) => (
                          <SelectItem key={v} value={v} className="text-xs">{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      title="Bearbeiten"
                      onClick={() => handleEdit(plan, month)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="w-3 h-3" />
                    </button>
                    {!plan.linked_billing_instruction_id && (
                      confirmDeletePlanId === plan.id ? (
                        <span className="flex items-center gap-1">
                          <span className="text-xs text-destructive font-medium">Löschen?</span>
                          <button
                            onClick={() => { deletePlanMutation.mutate(plan.id); setConfirmDeletePlanId(null); }}
                            className="text-xs text-white bg-destructive hover:bg-destructive/80 px-1.5 py-0.5 rounded">
                            Ja
                          </button>
                          <button onClick={() => setConfirmDeletePlanId(null)}
                            className="text-xs border px-1.5 py-0.5 rounded hover:bg-muted">
                            Nein
                          </button>
                        </span>
                      ) : (
                        <button
                          title="Planung löschen"
                          onClick={() => setConfirmDeletePlanId(plan.id)}
                          className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )
                    )}
                    {/* Instruction create button / status */}
                    {plan.linked_billing_instruction_id ? (() => {
                      const instr = allInstructions.find(i => i.id === plan.linked_billing_instruction_id);
                      const isDeletable = !instr || ['draft', 'blocked', 'cancelled'].includes(instr?.status);
                      return confirmUnlinkPlanId === plan.id ? (
                        <span className="flex items-center gap-1">
                          <span className="text-xs text-destructive font-medium">Löschen?</span>
                          <button
                            onClick={() => deleteInstructionMutation.mutate({ planId: plan.id, instructionId: plan.linked_billing_instruction_id })}
                            className="text-xs text-white bg-destructive hover:bg-destructive/80 px-1.5 py-0.5 rounded">
                            Ja
                          </button>
                          <button onClick={() => setConfirmUnlinkPlanId(null)}
                            className="text-xs border px-1.5 py-0.5 rounded hover:bg-muted">
                            Nein
                          </button>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-600 text-xs font-medium">Anweisung erstellt</span>
                          {isDeletable && (
                            <button
                              title="Anweisung löschen & Verknüpfung aufheben"
                              onClick={() => setConfirmUnlinkPlanId(plan.id)}
                              className="p-0.5 rounded hover:bg-red-50 text-muted-foreground hover:text-destructive transition-colors ml-0.5">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      );
                    })() : (
                      plan.planned_amount_net > 0 && (
                        <button
                          title="Abrechnungsanweisung erstellen"
                          disabled={creatingInstructionForPlanId === plan.id}
                          onClick={() => handleCreateInstruction(plan)}
                          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium px-2 py-0.5 rounded border border-primary/30 hover:bg-primary/5 transition-colors disabled:opacity-50">
                          {creatingInstructionForPlanId === plan.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <CheckCircle2 className="w-3 h-3" />}
                          Anweisung erstellen
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}

              {/* Inline add form */}
              {isAdding && (
                <div className="space-y-2 p-3 border rounded-xl bg-white">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Typ</label>
                      <Select value={form.planned_invoice_type || 'TR'}
                        onValueChange={v => setForm(f => ({ ...f, planned_invoice_type: v }))}>
                        <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AZ" className="text-xs">AZ – Anzahlung</SelectItem>
                          <SelectItem value="TR" className="text-xs">TR – Teilrechnung</SelectItem>
                          <SelectItem value="ER" className="text-xs">ER – Schlussrechnung</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">% (zusätzlich)</label>
                      <Input type="number" min="0" max="100"
                        value={form.planned_percent || ''}
                        onChange={e => handlePercentChange(Number(e.target.value))}
                        placeholder="z.B. 20"
                        className="h-7 text-xs mt-0.5" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Betrag netto</label>
                      <Input type="number" value={form.planned_amount_net || ''}
                        onChange={e => {
                          const net = Number(e.target.value);
                          const pct = totalOrderNet > 0 ? Math.round((net / totalOrderNet) * 100) : 0;
                          setForm(f => ({ ...f, planned_amount_net: net, planned_percent: pct, planned_amount_gross: Math.round(net * (1 + vatRate / 100) * 100) / 100 }));
                        }}
                        placeholder="0.00"
                        className="h-7 text-xs mt-0.5" />
                    </div>
                  </div>
                  {form.planned_amount_gross > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Brutto ({vatRate}% MwSt.): <span className="font-semibold">{formatCurrency(form.planned_amount_gross)}</span>
                      {form.planned_percent > 0 && totalOrderNet > 0 && (
                        <> · Stand nach Rechnung: {Math.round(((fin?.adjustedInvoicedNet || 0) + Number(form.planned_amount_net)) / totalOrderNet * 100)}%</>
                      )}
                    </p>
                  )}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted-foreground">Abrechnungsgrund</label>
                      <GenerateBillingReasonButton
                        project={project}
                        confirmedOrderId={linkedOrders?.[0]?.id}
                        plannedAmountNet={Number(form.planned_amount_net) || 0}
                        plannedPercent={Number(form.planned_percent) || 0}
                        plannedInvoiceType={form.planned_invoice_type || 'TR'}
                        planningMonth={month}
                        userReasonDraft={form.invoice_reason || ''}
                        onResult={text => setForm(f => ({ ...f, invoice_reason: text }))}
                        disabled={!form.planned_amount_net && !form.planned_percent}
                      />
                    </div>
                    <Textarea value={form.invoice_reason || ''}
                      onChange={e => setForm(f => ({ ...f, invoice_reason: e.target.value }))}
                      placeholder="Abrechnungsgrund (Warum kann abgerechnet werden?) — oder KI generieren lassen"
                      className="text-xs resize-none h-20" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground flex items-center gap-1"><Bell className="w-3 h-3" /> Erinnerungsdatum</label>
                      <Input type="date" value={form.reminder_date || ''}
                        onChange={e => setForm(f => ({ ...f, reminder_date: e.target.value }))}
                        className="h-7 text-xs mt-0.5" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Erinnerungsgrund</label>
                      <Input value={form.reminder_reason || ''}
                        onChange={e => setForm(f => ({ ...f, reminder_reason: e.target.value }))}
                        placeholder="z.B. QS abwarten"
                        className="h-7 text-xs mt-0.5" />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="h-7 text-xs"
                      disabled={(createMutation.isPending || updateMutation.isPending) || (!form.planned_percent && !form.planned_amount_net)}
                      onClick={() => handleSave(month, planningType)}>
                      {editingPlanId ? 'Aktualisieren' : 'Speichern'}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={() => { setAddingMonth(null); setEditingPlanId(null); setForm({}); }}>
                      Abbrechen
                    </Button>
                  </div>
                </div>
              )}

              {monthPlans.length === 0 && !isAdding && (
                <p className="text-xs text-muted-foreground italic">Noch keine Planung für diesen Monat</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}