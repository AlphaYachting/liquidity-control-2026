import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PIPELINES, SOURCE_LABELS } from '@/components/crm/stages';

const EMPTY = {
  pipeline: 'new_business', stage: 'new_lead', title: '', company_name: '', contact_name: '',
  contact_email: '', contact_phone: '', source: 'manual', value_net: 0, probability_percent: 50,
  next_step: '', next_step_date: '', description: '',
};

export default function DealFormDialog({ open, onOpenChange, initialData, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(initialData?.id);

  useEffect(() => {
    if (open) {
      const merged = { ...EMPTY, ...(initialData || {}) };
      // Startphase immer zur Pipeline passend setzen (Bug: Bestandskunden-Deal landete sonst unsichtbar in Neukunden-Phase)
      if (!initialData?.id && !initialData?.stage) merged.stage = PIPELINES[merged.pipeline].stages[0].key;
      setForm(merged);
    }
  }, [open, initialData]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handlePipelineChange = (p) => {
    setForm(f => ({ ...f, pipeline: p, stage: isEdit ? f.stage : PIPELINES[p].stages[0].key }));
  };

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const data = { ...form, value_net: Number(form.value_net) || 0, probability_percent: Number(form.probability_percent) || 0 };
      delete data.id; delete data.created_date; delete data.updated_date; delete data.created_by_id; delete data.created_by;
      let saved;
      if (isEdit) saved = await base44.entities.CrmDeal.update(initialData.id, data);
      else saved = await base44.entities.CrmDeal.create(data);
      onSaved?.(saved);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Deal bearbeiten' : 'Neuer Deal'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Pipeline</Label>
              <Select value={form.pipeline} onValueChange={handlePipelineChange}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_business">Neukunden</SelectItem>
                  <SelectItem value="existing_customer">Bestandskunden</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Quelle</Label>
              <Select value={form.source} onValueChange={v => set('source', v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SOURCE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Deal-Bezeichnung *</Label>
            <Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="z.B. Website-Relaunch Musterfirma" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Firma</Label>
              <Input value={form.company_name} onChange={e => set('company_name', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Ansprechperson</Label>
              <Input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">E-Mail</Label>
              <Input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Telefon</Label>
              <Input value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Erwarteter Wert netto (€)</Label>
              <Input type="number" value={form.value_net} onChange={e => set('value_net', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Wahrscheinlichkeit (%)</Label>
              <Input type="number" min={0} max={100} value={form.probability_percent} onChange={e => set('probability_percent', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nächster Schritt</Label>
              <Input value={form.next_step} onChange={e => set('next_step', e.target.value)} placeholder="z.B. Rückruf vereinbaren" />
            </div>
            <div>
              <Label className="text-xs">Fällig am</Label>
              <Input type="date" value={form.next_step_date || ''} onChange={e => set('next_step_date', e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Beschreibung</Label>
            <Textarea rows={3} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button onClick={save} disabled={saving || !form.title.trim()}>
              {saving ? 'Speichert…' : isEdit ? 'Speichern' : 'Deal anlegen'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}