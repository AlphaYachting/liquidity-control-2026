import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { resolveSupportProject, createSupportTicket, SUPPORT_MODELS, DEFAULT_SUPPORT_RATE } from '@/components/crm/support/supportTicket';

const ROLES = ['Beratung', 'Konzept', 'Text', 'Grafik', 'Web', 'Media', 'QS'];

export default function SupportTicketDialog({ open, onOpenChange, item, onDone }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const { data: projects = [] } = useQuery({
    queryKey: ['support-projects'],
    queryFn: () => base44.entities.Project.filter(
      { abrechnungsmodell: { $in: SUPPORT_MODELS } }, 'title', 200),
    enabled: open,
  });
  const { data: team = [] } = useQuery({
    queryKey: ['team-members-active'],
    queryFn: () => base44.entities.TeamMember.filter({ active: true }, 'name', 100),
    enabled: open,
  });

  useEffect(() => {
    if (!open || !item) return;
    const customer = item.matched_customer_name || item.sender_name || '';
    const match = projects.find(p => p.title === `Support — ${customer}`);
    setForm({
      customer,
      title: (item.subject || 'Support-Anfrage').slice(0, 200),
      description: item.body || '',
      role: 'Web',
      target_hours: 1,
      assignee_email: '',
      stundensatz: match?.stundensatz || DEFAULT_SUPPORT_RATE,
      project_id: match?.id || '__new__',
    });
    setError(null);
  }, [open, item, projects]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const user = await base44.auth.me().catch(() => null);
      const chosen = projects.find(p => p.id === form.project_id);
      const { project_id: projectId, milestone_id: milestoneId } = await resolveSupportProject(
        chosen ? (chosen.title || '').replace(/^Support — /, '') || form.customer : form.customer,
        {
          pmEmail: chosen?.pm_email || user?.email || '',
          contactEmail: item.sender_email || '',
          stundensatz: Number(form.stundensatz) || 0,
        },
      );
      const { ticket, back } = await createSupportTicket({ item, projectId, milestoneId, values: form });
      setBusy(false);
      onOpenChange(false);
      onDone?.(ticket, back);
    } catch (e) {
      setBusy(false);
      setError(e?.response?.data?.detail || e?.message || 'Das Ticket konnte nicht angelegt werden.');
    }
  };

  if (!form) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Support-Ticket anlegen</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Kunde</Label>
            <Input value={form.customer} onChange={e => set('customer', e.target.value)} />
            {item?.customer_match === 'unsicher' && (
              <p className="text-xs text-status-attention mt-1">
                Kundenzuordnung unsicher — bitte prüfen.
              </p>
            )}
          </div>
          <div>
            <Label className="text-xs">Ziel-Support-Projekt</Label>
            <Select value={form.project_id} onValueChange={v => set('project_id', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__new__">Support-Projekt des Kunden (neu anlegen)</SelectItem>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Titel</Label>
            <Input value={form.title} onChange={e => set('title', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Beschreibung</Label>
            <Textarea rows={5} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Rolle</Label>
              <Select value={form.role} onValueChange={v => set('role', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Stunden (geschätzt)</Label>
              <Input type="number" step="0.5" value={form.target_hours}
                onChange={e => set('target_hours', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Stundensatz</Label>
              <Input type="number" value={form.stundensatz}
                onChange={e => set('stundensatz', e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Zuständig</Label>
            <Select value={form.assignee_email || '__none__'}
              onValueChange={v => set('assignee_email', v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Noch offen</SelectItem>
                {team.map(t => <SelectItem key={t.id} value={t.email}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Es wird keine Rechnung ausgelöst. Gebuchte Zeit läuft über das Support-Projekt in „Unverrechnete Leistung".
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Abbrechen</Button>
          <Button onClick={submit} disabled={busy || !form.customer || !form.title}>
            {busy ? 'Wird angelegt…' : 'Ticket anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}