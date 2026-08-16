import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ensureContainer } from '@/lib/sprint/ensureContainer';
import { PROJECT_TYPES, PROJECT_TYPE_ORDER, projectTypeOf } from '@/components/sprint/projectTypes';
import ProjectTypeFields from '@/components/sprint/ProjectTypeFields';

const EMPTY = {
  client_id: '', title: '', pm_email: '', status: 'aktiv', total_budget: '',
  stundensatz: '', support_kontingent_stunden: '', recurring_contract_id: '', abrechnungsmodell: 'aufwand',
};

export default function ProjectFormDialog({ open, onOpenChange, project, clients = [], onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [type, setType] = useState('sprint');
  const [saving, setSaving] = useState(false);

  const { data: contracts = [] } = useQuery({
    queryKey: ['recurring-contracts-select'],
    queryFn: () => base44.entities.RecurringContract.list('-updated_date', 200),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setForm(project ? { ...EMPTY, ...project } : EMPTY);
    setType(projectTypeOf(project));
  }, [open, project]);

  // Nur Bearbeiten-Modus: neue Projekte entstehen ausschließlich im Assistenten
  if (open && !project?.id) return null;

  const originalType = projectTypeOf(project);
  const sprintSwitchWarning = Boolean(project?.id) && type !== originalType
    && (type === 'sprint' || originalType === 'sprint');

  const handleSave = async () => {
    if (!form.client_id || !form.title || !form.pm_email) return;
    setSaving(true);
    const def = PROJECT_TYPES[type];
    const data = {
      client_id: form.client_id,
      title: form.title,
      pm_email: form.pm_email,
      status: form.status,
      total_budget: Number(form.total_budget) || 0,
      abrechnungsmodell: def.model || form.abrechnungsmodell || 'aufwand',
      is_legacy: type === 'legacy',
      stundensatz: type === 'support' ? Number(form.stundensatz) || 0 : undefined,
      support_kontingent_stunden: type === 'container' ? Number(form.support_kontingent_stunden) || 0 : undefined,
      recurring_contract_id: type === 'container' ? (form.recurring_contract_id || '') : undefined,
    };
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

    // Nur Bearbeiten — neue Projekte entstehen ausschließlich im Anlage-Wizard
    const saved = await base44.entities.Project.update(project.id, data);

    if (def.container) await ensureContainer(saved);

    setSaving(false);
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="uppercase font-bold text-foreground">
            Projekt bearbeiten
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Projekttyp *</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROJECT_TYPE_ORDER.map((k) => (
                  <SelectItem key={k} value={k}>{PROJECT_TYPES[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sprintSwitchWarning && (
              <p className="mt-1 text-xs text-status-critical">
                Achtung: An Sprintprojekten hängen Termine und Etappenbeträge. Eine Umstellung ändert das Verhalten des Projekts.
              </p>
            )}
          </div>
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

          <ProjectTypeFields type={type} form={form} setForm={setForm} contracts={contracts} />

          <Button
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold uppercase rounded"
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