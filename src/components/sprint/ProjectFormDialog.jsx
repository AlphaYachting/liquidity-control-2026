import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ensureContainer } from '@/lib/sprint/ensureContainer';
import { kuerzelVorschlag } from '@/lib/zeit/useProjektSuche';
import { finanzIdVon } from '@/lib/projekt/cockpitSicherstellen';
import { PROJECT_TYPES, PROJECT_TYPE_ORDER, projectTypeOf } from '@/components/sprint/projectTypes';
import ProjectTypeFields from '@/components/sprint/ProjectTypeFields';
import RundungsFelder from '@/components/sprint/RundungsFelder';

const EMPTY = {
  client_id: '', title: '', pm_email: '', status: 'aktiv', total_budget: '',
  stundensatz: '', support_kontingent_stunden: '', recurring_contract_id: '', abrechnungsmodell: 'aufwand',
};

export default function ProjectFormDialog({ open, onOpenChange, project, clients = [], onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [type, setType] = useState('sprint');
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Jüngste gültige AB — liefert Vorschlag für Laufzeitbeginn und aWork-Projekt
  const { data: abVorschlag = null } = useQuery({
    queryKey: ['ab-vorschlag', project?.id],
    queryFn: async () => {
      const finanzId = finanzIdVon(project);
      const orders = await base44.entities.ConfirmedOrder.filter(
        { project_id: finanzId }, '-confirmation_date', 20,
      ).catch(() => []);
      const gueltig = orders
        .filter((o) => !['cancelled', 'draft'].includes(o.status) && (o.confirmation_date || o.signed_date))
        .sort((a, b) =>
          String(b.confirmation_date || b.signed_date).localeCompare(String(a.confirmation_date || a.signed_date)),
        );
      if (!gueltig.length) return null;
      const ab = gueltig[0];
      return {
        beginn: String(ab.confirmation_date || ab.signed_date).slice(0, 10),
        ab_nummer: ab.order_number || null,
      };
    },
    enabled: open && !!project?.id,
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ['recurring-contracts-select'],
    queryFn: () => base44.entities.RecurringContract.list('-updated_date', 200),
    enabled: open,
  });

  const { data: stichtagData } = useQuery({
    queryKey: ['awork-umstellung-stichtag'],
    queryFn: async () => {
      const rows = await base44.entities.Setting.filter({ key: 'awork_umstellung_stichtag' }, 'key', 1).catch(() => []);
      const wert = String(rows[0]?.value || '').slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(wert) ? wert : '2026-10-04';
    },
    enabled: open,
  });

  const { data: hatTickets = true } = useQuery({
    queryKey: ['projektHatTickets', project?.id],
    queryFn: async () => (await base44.entities.Ticket.filter({ project_id: project.id }, '-created_date', 1)).length > 0,
    enabled: open && !!project?.id,
  });

  useEffect(() => {
    if (!open) return;
    setForm(project ? { ...EMPTY, ...project } : EMPTY);
    setType(projectTypeOf(project));
  }, [open, project]);

  // Nur Bearbeiten-Modus: neue Projekte entstehen ausschließlich im Assistenten
  if (open && !project?.id) return null;

  const originalType = projectTypeOf(project);
  // Wechsel von/zu Sprint nur ohne bestehende Aufgaben
  const gesperrt = (k) => hatTickets && (originalType === 'sprint' ? k !== 'sprint' : k === 'sprint');

  const handleSave = async () => {
    if (!form.client_id || !form.title || !form.pm_email) return;
    setSaving(true);
    const def = PROJECT_TYPES[type];
    const isContainer = type === 'container';

    // Periodenwechsel erkennen: bestehender Beginn, neuer Wert liegt später
    const altBeginn = project.laufzeit_beginn ? String(project.laufzeit_beginn).slice(0, 10) : null;
    const neuBeginn = form.laufzeit_beginn ? String(form.laufzeit_beginn).slice(0, 10) : null;
    const isPeriodChange = isContainer && altBeginn && neuBeginn && neuBeginn > altBeginn;

    const data = {
      client_id: form.client_id,
      title: form.title,
      kuerzel: (form.kuerzel || '').toLowerCase(),
      pm_email: form.pm_email,
      status: form.status,
      total_budget: Number(form.total_budget) || 0,
      abrechnungsmodell: def.model || form.abrechnungsmodell || 'aufwand',
      is_legacy: type === 'legacy',
      rundung_minuten: Number(form.rundung_minuten) || 0,
      rundung_art: form.rundung_art || 'auf',
      rundung_basis: form.rundung_basis || 'tag_projekt',
      mindestbuchung_minuten: Number(form.mindestbuchung_minuten) || 0,
      stundensatz: type === 'support' || type === 'regie' ? Number(form.stundensatz) || 0 : undefined,
      aufwand_art: type === 'support' || type === 'regie' ? type : undefined,
      support_kontingent_stunden: ['container', 'support', 'regie'].includes(type) ? Number(form.support_kontingent_stunden) || 0 : undefined,
      recurring_contract_id: type === 'container' ? (form.recurring_contract_id || '') : undefined,
    };
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

    if (isContainer) {
      if (isPeriodChange) {
        // Zunächst Periode abschließen, dann restliche Felder ohne Beginn/Übertrag
        await base44.functions.invoke('kontingentPeriodeAbschliessen', {
          project_id: project.id,
          neuer_beginn: neuBeginn,
          uebertrag: Number(form.kontingent_uebertrag_stunden) || 0,
        });
      } else {
        data.laufzeit_beginn = neuBeginn || null;
        data.laufzeit_beginn_quelle = abVorschlag?.beginn && neuBeginn === abVorschlag.beginn ? 'ab' : 'manuell';
        data.kontingent_uebertrag_stunden = Number(form.kontingent_uebertrag_stunden) || 0;
        const stichtag = stichtagData || '2026-10-04';
        data.awork_altstand_stunden = neuBeginn > stichtag
          ? 0
          : (form.awork_altstand_stunden === '' || form.awork_altstand_stunden == null ? null : Number(form.awork_altstand_stunden) || 0);
        data.awork_altstand_beginn = neuBeginn || null;
      }
    }

    // Nur Bearbeiten — neue Projekte entstehen ausschließlich im Anlage-Wizard
    const saved = await base44.entities.Project.update(project.id, data);

    if (def.container) await ensureContainer(saved);

    queryClient.invalidateQueries({ queryKey: ['projektKontext'] });
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
                  <SelectItem key={k} value={k} disabled={gesperrt(k)}>{PROJECT_TYPES[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {PROJECT_TYPE_ORDER.some(gesperrt) && (
              <p className="mt-1 text-xs text-muted-foreground">
                {originalType === 'sprint' ? 'Andere Typen' : 'Sprint'}: Mit bestehenden Aufgaben nicht möglich – bitte ein neues Projekt anlegen.
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
          <div>
            <Label>Kürzel (für die Zeiterfassung)</Label>
            <Input
              maxLength={5}
              placeholder={kuerzelVorschlag(clients.find((c) => c.id === form.client_id)?.name || form.title)}
              value={form.kuerzel || ''}
              onChange={(e) => setForm((f) => ({ ...f, kuerzel: e.target.value.slice(0, 5) }))}
            />
          </div>
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

          <ProjectTypeFields type={type} form={form} setForm={setForm} contracts={contracts} project={project} abVorschlag={abVorschlag} user={user} />

          <RundungsFelder form={form} setForm={setForm} />

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