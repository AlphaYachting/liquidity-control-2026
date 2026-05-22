import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, X } from 'lucide-react';
import { MONTHS_2026, getMonthLabel } from '@/lib/liquidityUtils';

const PM_OPTIONS = ['Lara', 'Sebastian', 'Pascal', 'Anna'];
const BACKOFFICE_OPTIONS = ['Lara', 'Sebastian', 'Pascal', 'Anna', 'Backoffice'];

const INVOICE_TYPES = [
  ['advance_invoice', 'Anzahlung'],
  ['partial_invoice', 'Teilrechnung'],
  ['final_invoice', 'Schlussrechnung'],
  ['correction', 'Korrektur'],
  ['credit_note', 'Gutschrift'],
];

const BACKOFFICE_STATUSES = [
  ['not_ready', 'Nicht bereit'],
  ['ready_for_backoffice', 'Bereit für Backoffice'],
  ['sent_to_backoffice', 'An Backoffice gesendet'],
  ['invoice_created', 'Rechnung erstellt'],
  ['paid', 'Bezahlt'],
  ['blocked', 'Blockiert'],
];

export default function BillingBlockForm({ block, onSave, onCancel, isSaving }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    amount_net: '',
    billing_month: '',
    invoice_readiness_status: 'not_ready',
    work_status: 'not_started',
    probability_percent: 90,
    responsible_person: '',
    notes: '',
    sort_order: 0,
    // Backoffice instruction fields
    planned_invoice_date: '',
    planned_invoice_amount: '',
    invoice_type: 'partial_invoice',
    invoice_instruction_text: '',
    invoice_reason: '',
    backoffice_status: 'not_ready',
    assigned_backoffice_user: '',
    ...block,
  });

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      amount_net: Number(form.amount_net) || 0,
      probability_percent: Number(form.probability_percent) || 90,
      planned_invoice_amount: Number(form.planned_invoice_amount) || 0,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm font-semibold">{block ? 'Paket bearbeiten' : 'Neues Abrechnungspaket'}</p>

      {/* BASIS */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs">Titel *</Label>
          <Input required value={form.title} onChange={e => update('title', e.target.value)} placeholder="z.B. Strategie & Konzept" />
        </div>
        <div>
          <Label className="text-xs">Betrag netto (€) *</Label>
          <Input required type="number" value={form.amount_net} onChange={e => update('amount_net', e.target.value)} placeholder="3000" />
        </div>
        <div>
          <Label className="text-xs">Abrechnungsmonat</Label>
          <Select value={form.billing_month || ''} onValueChange={v => update('billing_month', v)}>
            <SelectTrigger><SelectValue placeholder="Monat wählen" /></SelectTrigger>
            <SelectContent>
              {MONTHS_2026.map(m => <SelectItem key={m} value={m}>{getMonthLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Arbeitsstatus</Label>
          <Select value={form.work_status || 'not_started'} onValueChange={v => update('work_status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[['not_started','Nicht begonnen'],['in_progress','In Arbeit'],['completed','Fertig'],['blocked','Blockiert']].map(([v,l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Abrechnungsstatus</Label>
          <Select value={form.invoice_readiness_status} onValueChange={v => update('invoice_readiness_status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[['not_ready','Nicht bereit'],['in_progress','In Bearbeitung'],['ready','Bereit'],['invoiced','Verrechnet'],['paid','Bezahlt']].map(([v,l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Wahrscheinlichkeit (%)</Label>
          <Input type="number" min={0} max={100} value={form.probability_percent} onChange={e => update('probability_percent', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Verantwortlich</Label>
          <Select value={form.responsible_person || ''} onValueChange={v => update('responsible_person', v)}>
            <SelectTrigger><SelectValue placeholder="PM wählen" /></SelectTrigger>
            <SelectContent>
              {PM_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Reihenfolge</Label>
          <Input type="number" value={form.sort_order} onChange={e => update('sort_order', e.target.value)} />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Notizen</Label>
          <Textarea value={form.notes || ''} onChange={e => update('notes', e.target.value)} rows={2} />
        </div>
      </div>

      {/* BACKOFFICE ABRECHNUNGSANWEISUNG */}
      <div className="border-t pt-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Abrechnungsanweisung für Backoffice</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Rechnungstyp</Label>
            <Select value={form.invoice_type || 'partial_invoice'} onValueChange={v => update('invoice_type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVOICE_TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Geplanter Rechnungsbetrag (€)</Label>
            <Input type="number" value={form.planned_invoice_amount || ''} onChange={e => update('planned_invoice_amount', e.target.value)} placeholder="wie Paketbetrag" />
          </div>
          <div>
            <Label className="text-xs">Geplantes Rechnungsdatum</Label>
            <Input type="date" value={form.planned_invoice_date || ''} onChange={e => update('planned_invoice_date', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Backoffice-Status</Label>
            <Select value={form.backoffice_status || 'not_ready'} onValueChange={v => update('backoffice_status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BACKOFFICE_STATUSES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Zuständig Backoffice</Label>
            <Select value={form.assigned_backoffice_user || ''} onValueChange={v => update('assigned_backoffice_user', v)}>
              <SelectTrigger><SelectValue placeholder="Person wählen" /></SelectTrigger>
              <SelectContent>
                {BACKOFFICE_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Abrechnungsgrund</Label>
            <Input value={form.invoice_reason || ''} onChange={e => update('invoice_reason', e.target.value)} placeholder="z.B. Abnahme Konzeptphase" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Rechnungstext / Anweisung</Label>
            <Textarea value={form.invoice_instruction_text || ''} onChange={e => update('invoice_instruction_text', e.target.value)} rows={2} placeholder="Text für Rechnung oder Hinweis an Backoffice…" />
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={isSaving}>
          <Save className="w-3.5 h-3.5 mr-1" /> {isSaving ? 'Speichern…' : 'Speichern'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          <X className="w-3.5 h-3.5 mr-1" /> Abbrechen
        </Button>
      </div>
    </form>
  );
}