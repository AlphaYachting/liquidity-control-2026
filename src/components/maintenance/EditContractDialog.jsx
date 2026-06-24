import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const INTERVALS = [
  { value: 'monthly', label: 'Monatlich' },
  { value: 'quarterly', label: 'Quartalsweise' },
  { value: 'yearly', label: 'Jährlich' },
  { value: 'once', label: 'Einmalig' },
  { value: 'by_effort', label: 'Nach Aufwand' },
];

const STATUSES = [
  { value: 'active', label: 'Aktiv' },
  { value: 'paused', label: 'Pausiert' },
  { value: 'cancelled', label: 'Gekündigt' },
  { value: 'pending', label: 'Ausstehend' },
  { value: 'unclear', label: 'Unklar' },
];

export default function EditContractDialog({ contract, onSave, onClose, title }) {
  const [form, setForm] = useState({});

  useEffect(() => {
    if (contract) setForm({ ...contract });
  }, [contract]);

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const handleSave = () => {
    onSave(form);
    onClose();
  };

  if (!contract) return null;

  return (
    <Dialog open={!!contract} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title || 'Vertrag bearbeiten'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Kunde</Label>
              <Input value={form.customer || ''} onChange={e => set('customer', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Vertragsbezeichnung</Label>
              <Input value={form.project_name || ''} onChange={e => set('project_name', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status || 'active'} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Intervall</Label>
              <Select value={form.billing_interval || 'yearly'} onValueChange={v => set('billing_interval', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INTERVALS.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Jahresbetrag (€)</Label>
              <Input type="number" value={form.annual_amount || ''} onChange={e => set('annual_amount', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label>Monatlicher Fixbetrag (€)</Label>
              <Input type="number" value={form.monthly_fixed_price || ''} onChange={e => set('monthly_fixed_price', parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Startdatum</Label>
              <Input type="date" value={form.start_date || ''} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fälligkeitsdatum</Label>
              <Input type="date" value={form.due_date || ''} onChange={e => set('due_date', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notizen</Label>
            <Textarea rows={3} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSave}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}