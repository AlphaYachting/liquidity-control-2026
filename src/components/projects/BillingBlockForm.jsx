import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, X } from 'lucide-react';
import { MONTHS_2026, getMonthLabel } from '@/lib/liquidityUtils';

const PM_OPTIONS = ['Lara', 'Sebastian', 'Pascal', 'Anna'];

export default function BillingBlockForm({ block, onSave, onCancel, isSaving }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    amount_net: '',
    billing_month: '',
    invoice_readiness_status: 'not_ready',
    probability_percent: 90,
    responsible_person: '',
    notes: '',
    sort_order: 0,
    ...block,
  });

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...form, amount_net: Number(form.amount_net) || 0, probability_percent: Number(form.probability_percent) || 90 });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm font-semibold">{block ? 'Paket bearbeiten' : 'Neues Abrechnungspaket'}</p>
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
          <Label className="text-xs">Status</Label>
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