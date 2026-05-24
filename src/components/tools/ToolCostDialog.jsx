import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const DEPTS = [
  { value: 'design', label: 'Design' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'programming', label: 'Programmierung' },
  { value: 'project_management', label: 'PM' },
  { value: 'general', label: 'Allgemein' },
  { value: 'other', label: 'Sonstiges' },
];
const INTERVALS = [
  { value: 'monthly', label: 'Monatlich' },
  { value: 'quarterly', label: 'Quartalsweise' },
  { value: 'yearly', label: 'Jährlich' },
  { value: 'one_time', label: 'Einmalig' },
  { value: 'unclear', label: 'Unklar' },
];
const STATUSES = [
  { value: 'paid', label: 'Bezahlt' },
  { value: 'pending', label: 'Ausstehend' },
  { value: 'overdue', label: 'Überfällig' },
  { value: 'unclear', label: 'Unklar' },
  { value: 'not_invoiced', label: 'Nicht verrechnet' },
];

const EMPTY = {
  tool_name: '', department: 'general', annual_cost: '', monthly_cost: '',
  payment_status: 'pending', payment_interval: 'monthly',
  needed: true, customer_recharge: '', info: '',
};

export default function ToolCostDialog({ open, onClose, onSave, tool }) {
  const [form, setForm] = useState(EMPTY);
  const isEdit = !!tool;

  useEffect(() => {
    if (tool) {
      setForm({
        tool_name: tool.tool_name || '',
        department: tool.department || 'general',
        annual_cost: tool.annual_cost ?? '',
        monthly_cost: tool.monthly_cost ?? '',
        payment_status: tool.payment_status || 'pending',
        payment_interval: tool.payment_interval || 'monthly',
        needed: tool.needed !== false,
        customer_recharge: tool.customer_recharge || '',
        info: tool.info || '',
      });
    } else {
      setForm(EMPTY);
    }
  }, [tool, open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    onSave({
      ...form,
      annual_cost: Number(form.annual_cost) || 0,
      monthly_cost: Number(form.monthly_cost) || 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Tool bearbeiten' : 'Neues Tool hinzufügen'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2 space-y-1">
            <Label>Name *</Label>
            <Input value={form.tool_name} onChange={e => set('tool_name', e.target.value)} placeholder="z.B. Figma" />
          </div>

          <div className="space-y-1">
            <Label>Abteilung</Label>
            <Select value={form.department} onValueChange={v => set('department', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DEPTS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Zahlungsintervall</Label>
            <Select value={form.payment_interval} onValueChange={v => set('payment_interval', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{INTERVALS.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Jahreskosten (€)</Label>
            <Input type="number" value={form.annual_cost} onChange={e => set('annual_cost', e.target.value)} placeholder="0" />
          </div>

          <div className="space-y-1">
            <Label>Monatliche Kosten (€)</Label>
            <Input type="number" value={form.monthly_cost} onChange={e => set('monthly_cost', e.target.value)} placeholder="0" />
          </div>

          <div className="space-y-1">
            <Label>Zahlungsstatus</Label>
            <Select value={form.payment_status} onValueChange={v => set('payment_status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Benötigt</Label>
            <Select value={String(form.needed)} onValueChange={v => set('needed', v === 'true')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Ja</SelectItem>
                <SelectItem value="false">Nein</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 space-y-1">
            <Label>Weiterverrechnung</Label>
            <Input value={form.customer_recharge} onChange={e => set('customer_recharge', e.target.value)} placeholder="Kunde / Projekt" />
          </div>

          <div className="col-span-2 space-y-1">
            <Label>Info</Label>
            <Input value={form.info} onChange={e => set('info', e.target.value)} placeholder="Notiz" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={!form.tool_name.trim()}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}