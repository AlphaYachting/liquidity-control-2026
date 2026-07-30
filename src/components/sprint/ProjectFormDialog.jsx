import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const EMPTY = { client_id: '', title: '', pm_email: '', status: 'aktiv', total_budget: '' };

export default function ProjectFormDialog({ open, onOpenChange, project, clients = [], onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(project ? { ...EMPTY, ...project } : EMPTY);
  }, [open, project]);

  const handleSave = async () => {
    if (!form.client_id || !form.title || !form.pm_email) return;
    setSaving(true);
    const data = {
      client_id: form.client_id, title: form.title, pm_email: form.pm_email,
      status: form.status, total_budget: Number(form.total_budget) || 0,
    };
    if (project?.id) await base44.entities.Project.update(project.id, data);
    else await base44.entities.Project.create(data);
    setSaving(false);
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="uppercase font-bold text-[#2d2d2d]">
            {project ? 'Projekt bearbeiten' : 'Projekt anlegen'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Kunde *</Label>
            <Select value={form.client_id} onValueChange={(v) => setForm((f) => ({ ...f, client_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Kunde wählen" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Projekttitel *</Label><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></div>
          <div><Label>Projektmanager (E-Mail) *</Label><Input type="email" value={form.pm_email} onChange={(e) => setForm((f) => ({ ...f, pm_email: e.target.value }))} /></div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="aktiv">Aktiv</SelectItem>
                <SelectItem value="pausiert">Pausiert</SelectItem>
                <SelectItem value="abgeschlossen">Abgeschlossen</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Gesamtbudget netto (EUR)</Label><Input type="number" value={form.total_budget} onChange={(e) => setForm((f) => ({ ...f, total_budget: e.target.value }))} /></div>
          <Button
            className="w-full bg-[#ff3764] hover:bg-[#e62e58] text-white font-bold uppercase rounded"
            disabled={saving || !form.client_id || !form.title || !form.pm_email}
            onClick={handleSave}
          >
            {saving ? 'Speichert…' : 'Speichern'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}