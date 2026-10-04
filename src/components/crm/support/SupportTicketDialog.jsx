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
import { descriptionFromThread } from '@/components/crm/support/threadDescription';
import { kundenSchluessel } from '@/lib/kunden/kundeAnlegen';
import { dringlichkeit, faelligAm, SUPPORT_FRIST_TAGE } from '@/components/crm/support/faelligkeit';
import { Link } from 'react-router-dom';

const ROLES = ['Beratung', 'Konzept', 'Text', 'Grafik', 'Web', 'Media', 'QS'];
// Feste leere Liste — solange die Daten laden, darf die Vorbelegung nicht bei jedem Rendern neu laufen
const KEINE = [];

export default function SupportTicketDialog({ open, onOpenChange, item, onDone }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [loadingThread, setLoadingThread] = useState(false);

  const { data: projects = KEINE } = useQuery({
    queryKey: ['support-projects'],
    queryFn: () => base44.entities.Project.filter(
      { abrechnungsmodell: { $in: SUPPORT_MODELS } }, 'title', 200),
    enabled: open,
  });
  // Der Kunde wird nur gewählt — angelegt wird er ausschließlich im Kundenverzeichnis
  const { data: clients = KEINE } = useQuery({
    queryKey: ['support-clients'],
    queryFn: () => base44.entities.Client.list('name', 2000),
    enabled: open,
  });
  const { data: team = [] } = useQuery({
    queryKey: ['team-members-active'],
    queryFn: () => base44.entities.TeamMember.filter({ active: true }, 'name', 100),
    enabled: open,
  });

  useEffect(() => {
    if (!open || !item) return;
    const erkannt = item.matched_customer_name || item.sender_name || '';
    const nachName = erkannt ? clients.find(c => kundenSchluessel(c.name) === kundenSchluessel(erkannt)) : null;
    const match = projects.find(p => p.title === `Support — ${nachName?.name || erkannt}`);
    // Kunde: Namenstreffer im Verzeichnis, sonst der Kunde des passenden Support-Projekts
    const kunde = nachName || clients.find(c => c.id === match?.client_id) || null;
    const customer = kunde?.name || '';
    const itemKey = String(item.id || item.thread_id || '');
    const dring = dringlichkeit(item);
    setForm((vorher) => ({
      // Fälligkeit: 4 Tage, bei dringender Störung sofort — eine händische Änderung bleibt erhalten
      ...(vorher?.item_key === itemKey && vorher.planned_for
        ? { planned_for: vorher.planned_for, faellig_manuell: vorher.faellig_manuell, dringend_grund: vorher.dringend_grund }
        : { planned_for: faelligAm(dring.dringend), faellig_manuell: false, dringend_grund: dring.grund }),
      customer,
      client_id: kunde?.id || '',
      erkannt,
      item_key: itemKey,
      title: (item.subject || 'Support-Anfrage').slice(0, 200),
      // nachgeladener Verlauf bleibt erhalten, wenn die Listen später eintreffen
      description: item.body || (vorher?.item_key === itemKey ? vorher.description : '') || '',
      role: 'Web',
      target_hours: 1,
      assignee_email: '',
      stundensatz: match?.stundensatz || DEFAULT_SUPPORT_RATE,
      project_id: match?.id || '__new__',
    }));
    setError(null);
  }, [open, item, projects, clients]);

  // Kommt die Anfrage aus der E-Mail-Zentrale, fehlt der Text — Verlauf nachladen.
  useEffect(() => {
    if (!open || !item) return;
    // Nur eine echte Thread-Id zählt — die Id eines Posteingangs-Eintrags ist kein Thread
    const threadId = item.thread_id
      || (String(item.email_message_id || '').startsWith('thread:') ? item.email_message_id.slice(7) : null);
    if (item.body || !threadId) return;
    let cancelled = false;
    setLoadingThread(true);
    descriptionFromThread(threadId)
      .then((text) => {
        if (cancelled || !text) return;
        setForm((f) => {
          if (!f) return f;
          const neu = f.description ? f : { ...f, description: text };
          // Dringlichkeit auch im nachgeladenen Verlauf prüfen
          const dring = dringlichkeit(item, text);
          return dring.dringend && !neu.faellig_manuell && !neu.dringend_grund
            ? { ...neu, planned_for: faelligAm(true), dringend_grund: dring.grund }
            : neu;
        });
      })
      .finally(() => { if (!cancelled) setLoadingThread(false); });
    return () => { cancelled = true; };
  }, [open, item]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const user = await base44.auth.me().catch(() => null);
      const chosen = projects.find(p => p.id === form.project_id);
      const { project_id: projectId, milestone_id: milestoneId } = await resolveSupportProject(
        chosen ? form.customer || (chosen.title || '').replace(/^Support — /, '') : form.customer,
        {
          projectId: chosen?.id,
          pmEmail: chosen?.pm_email || user?.email || '',
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
      {/* Kopf und Fuß stehen fest, nur der Formularteil scrollt — die Knöpfe bleiben immer erreichbar */}
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0"><DialogTitle>Support-Ticket anlegen</DialogTitle></DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Kunde</Label>
            <Select
              value={form.client_id}
              onValueChange={v => setForm(f => ({ ...f, client_id: v, customer: clients.find(c => c.id === v)?.name || '' }))}
            >
              <SelectTrigger><SelectValue placeholder="Kunde wählen" /></SelectTrigger>
              <SelectContent>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {!form.client_id && (
              <p className="text-xs text-status-attention mt-1">
                {form.erkannt ? `„${form.erkannt}" ist noch kein Kunde im Verzeichnis. ` : ''}
                Bestehenden Kunden wählen oder zuerst im{' '}
                <Link className="underline" to="/sprint/projekte?tab=kunden">Kundenverzeichnis</Link> anlegen.
              </p>
            )}
            {item?.customer_match === 'unsicher' && (
              <p className="text-xs text-status-attention mt-1">
                Kundenzuordnung unsicher — bitte prüfen.
              </p>
            )}
          </div>
          <div>
            <Label className="text-xs">Ziel-Support-Projekt</Label>
            <Select
              value={form.project_id}
              onValueChange={v => {
                // Bestehendes Support-Projekt gewählt → dessen Kunde wird übernommen
                const kunde = clients.find(c => c.id === projects.find(p => p.id === v)?.client_id);
                setForm(f => ({ ...f, project_id: v, ...(kunde ? { client_id: kunde.id, customer: kunde.name } : {}) }));
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__new__">Support-Projekt des Kunden (neu anlegen)</SelectItem>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          </div>
          <div>
            <Label className="text-xs">Titel</Label>
            <Input value={form.title} onChange={e => set('title', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Beschreibung</Label>
            <Textarea
              rows={6}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder={loadingThread ? 'Verlauf wird geladen…' : 'Anliegen des Kunden kurz beschreiben'}
            />
            {!loadingThread && !form.description.trim() && (
              <p className="text-xs text-status-attention mt-1">
                Anliegen des Kunden kurz beschreiben — ein Ticket darf nicht nur den Betreff tragen.
              </p>
            )}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Fällig am</Label>
            <Input type="date" value={form.planned_for || ''}
              onChange={e => setForm(f => ({ ...f, planned_for: e.target.value, faellig_manuell: true }))} />
            <p className={`text-xs mt-1 ${form.dringend_grund && !form.faellig_manuell ? 'text-status-attention' : 'text-muted-foreground'}`}>
              {form.faellig_manuell
                ? 'Händisch gesetzt.'
                : form.dringend_grund
                  ? `Dringend erkannt (${form.dringend_grund}) — sofort fällig. Bei Bedarf ändern.`
                  : `Standard: ${SUPPORT_FRIST_TAGE} Tage ab heute.`}
            </p>
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
          </div>
          <p className="text-xs text-muted-foreground">
            Es wird keine Rechnung ausgelöst. Der gesamte E-Mail-Verlauf wird ins Ticket übernommen. Sobald das Ticket erledigt ist, erscheint die gebuchte Zeit in der Support-Abrechnung.
          </p>
        </div>
        <DialogFooter className="px-6 py-3 border-t shrink-0 sm:items-center">
          {error && <p className="text-xs text-destructive sm:mr-auto sm:max-w-[60%]">{error}</p>}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Abbrechen</Button>
          <Button onClick={submit} disabled={busy || loadingThread || !form.customer || !form.title || !form.description.trim()}>
            {busy ? 'Wird angelegt…' : 'Ticket anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}