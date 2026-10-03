import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { resolveAssignee } from '@/lib/sprint/assignment';
import { initials } from '@/components/sprint/PersonenChip';

const norm = (s) => (s || '').trim().toLowerCase();
const h = (v) => (Number(v) || 0).toLocaleString('de-AT', { maximumFractionDigits: 1 });

// Ein Aufgabenset (Modul aus dem Katalog) in eine Etappe übernehmen — wahlweise als eine
// Aufgabe mit dem Etappennamen oder als alle Aufgaben des Sets. Was es in der Etappe
// unter gleichem Titel schon gibt, wird nicht doppelt angelegt.
export default function AufgabensetDialog({ open, onOpenChange, milestones = [], tickets = [], members = [], projectId, pmEmail, startEtappeId, onCreated }) {
  const [etappeId, setEtappeId] = useState('');
  const [modulId, setModulId] = useState('');
  const [suche, setSuche] = useState('');
  const [einzeln, setEinzeln] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');

  const { data: katalog, isLoading } = useQuery({
    queryKey: ['aufgabensetKatalog'],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [module, vorlagen] = await Promise.all([
        base44.entities.ModuleTemplate.list('name', 300),
        base44.entities.TicketTemplate.list('order', 2000),
      ]);
      return module
        .filter((m) => m.active !== false)
        .map((m) => ({
          ...m,
          vorlagen: vorlagen
            .filter((v) => v.module_template_id === m.id)
            .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)),
        }))
        .filter((m) => m.vorlagen.length > 0);
    },
  });
  const sets = katalog || [];

  useEffect(() => {
    if (!open) return;
    const start = startEtappeId || milestones.find((m) => m.state !== 'freigegeben')?.id || milestones[0]?.id || '';
    setEtappeId(start);
    setSuche('');
    setFehler('');
    setModulId('');
  }, [open, startEtappeId, milestones]);

  const etappe = milestones.find((m) => m.id === etappeId);

  // Vorauswahl: das Modul, mit dem die Etappe angelegt wurde, sonst das erste im Katalog
  useEffect(() => {
    if (!open || modulId || !sets.length) return;
    const eigenes = sets.find((s) => s.id === etappe?.module_template_id);
    setModulId((eigenes || sets[0]).id);
  }, [open, modulId, sets, etappe]);

  const sichtbar = sets.filter((s) => !suche.trim() || norm(s.name).includes(norm(suche)));
  const set = sets.find((s) => s.id === modulId);
  const istChangeRequest = etappe?.released === true || etappe?.state === 'freigegeben';

  const plan = useMemo(() => {
    if (!set || !etappe) return { vorschau: [], neu: [] };
    const vorhanden = new Set(tickets.filter((t) => t.milestone_id === etappe.id).map((t) => norm(t.title)));
    const person = (rolle) => resolveAssignee(rolle, members) || pmEmail || '';
    if (einzeln) {
      const haupt = set.vorlagen.find((v) => v.milestone_state === 'produktion') || set.vorlagen[0];
      const eintrag = {
        title: etappe.title,
        role: haupt.role || undefined,
        assignee_email: person(haupt.role) || undefined,
        milestone_state: 'produktion',
        target_hours: set.vorlagen.reduce((s, v) => s + (Number(v.target_hours) || 0), 0),
      };
      const doppelt = vorhanden.has(norm(eintrag.title));
      return { vorschau: [{ ...eintrag, doppelt }], neu: doppelt ? [] : [eintrag] };
    }
    const alle = set.vorlagen.map((v) => ({
      title: v.title,
      role: v.role || undefined,
      assignee_email: person(v.role) || undefined,
      milestone_state: v.milestone_state || 'produktion',
      blocks_others: v.blocks_others || false,
      target_hours: Number(v.target_hours) || 0,
      doppelt: vorhanden.has(norm(v.title)),
    }));
    return { vorschau: alle, neu: alle.filter((a) => !a.doppelt) };
  }, [set, etappe, tickets, members, pmEmail, einzeln]);

  const doppelte = plan.vorschau.filter((v) => v.doppelt).length;
  const nameVon = (email) => members.find((m) => m.email === email)?.name || email;

  const anlegen = async () => {
    if (!plan.neu.length || !etappe) return;
    setLaeuft(true);
    setFehler('');
    try {
      const start = tickets.filter((t) => t.milestone_id === etappe.id).reduce((m, t) => Math.max(m, Number(t.order) || 0), 0);
      const jetzt = new Date().toISOString();
      await base44.entities.Ticket.bulkCreate(plan.neu.map(({ doppelt, ...t }, i) => ({
        ...t,
        milestone_id: etappe.id,
        project_id: projectId,
        order: start + i + 1,
        status: 'offen',
        origin: istChangeRequest ? 'change_request' : 'pflicht',
        last_status_change: jetzt,
      })));
      const n = plan.neu.length;
      onCreated?.(`${n === 1 ? '1 Aufgabe' : `${n} Aufgaben`} aus „${set.name}" in ${etappe.title} angelegt.`, etappe.id);
      onOpenChange(false);
    } catch (e) {
      setFehler(e?.message || 'Aufgaben konnten nicht angelegt werden.');
    }
    setLaeuft(false);
  };

  const wahl = (aktiv) => (aktiv ? 'border-2 border-foreground' : 'border border-input');
  const knopfText = !plan.neu.length
    ? 'Alles schon vorhanden'
    : plan.neu.length === 1 ? '1 Aufgabe anlegen' : `${plan.neu.length} Aufgaben anlegen`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Aufgabenset hinzufügen</DialogTitle></DialogHeader>

        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label>Etappe</Label>
            <Select value={etappeId} onValueChange={setEtappeId}>
              <SelectTrigger><SelectValue placeholder="Etappe wählen" /></SelectTrigger>
              <SelectContent>
                {milestones.map((m) => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="set-suche">Set aus dem Modulkatalog</Label>
            <Input id="set-suche" type="search" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Set suchen …" />
            <div className="max-h-56 overflow-y-auto space-y-1.5 pt-0.5">
              {isLoading && <Skeleton className="h-24 w-full bg-muted" />}
              {!isLoading && sichtbar.length === 0 && <p className="text-meta text-muted-foreground py-1">Kein Set gefunden.</p>}
              {sichtbar.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={s.id === modulId}
                  onClick={() => setModulId(s.id)}
                  className={`w-full flex items-center justify-between gap-3 rounded bg-card px-3 py-2.5 text-left text-sm ${wahl(s.id === modulId)}`}
                >
                  <span>{s.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {s.vorlagen.length} Aufgaben · {h(s.vorlagen.reduce((n, v) => n + (Number(v.target_hours) || 0), 0))} h
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Anlegen als</Label>
            <div className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={einzeln} onClick={() => setEinzeln(true)}
                className={`flex-[1_1_220px] rounded bg-card px-3 py-2.5 text-left text-[13px] ${wahl(einzeln)}`}>
                <strong>Eine Aufgabe</strong><br />mit dem Etappennamen, Planstunden zusammengezählt
              </button>
              <button type="button" aria-pressed={!einzeln} onClick={() => setEinzeln(false)}
                className={`flex-[1_1_220px] rounded bg-card px-3 py-2.5 text-left text-[13px] ${wahl(!einzeln)}`}>
                <strong>Alle Aufgaben des Sets</strong><br />je Rolle eine eigene Aufgabe
              </button>
            </div>
          </div>

          {set && etappe && (
            <div className="rounded border border-border bg-muted/40 px-3 py-2.5 space-y-1.5">
              <p className="text-xs font-medium text-[#555555]">Wird angelegt</p>
              {plan.vorschau.map((v, i) => (
                <div key={i} className={`flex items-center gap-2.5 text-[13px] ${v.doppelt ? 'text-[#9A9A9A]' : 'text-foreground'}`}>
                  <span className="flex-1 min-w-0 truncate">{v.title}</span>
                  <span className="w-8 text-center" title={v.assignee_email ? nameVon(v.assignee_email) : 'nicht zugewiesen'}>
                    {v.assignee_email ? initials(nameVon(v.assignee_email)) : '—'}
                  </span>
                  <span className="w-12 text-right">{h(v.target_hours)} h</span>
                  <span className="w-28 text-right text-xs">{v.doppelt ? 'schon vorhanden' : ''}</span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                {doppelte > 0
                  ? `${doppelte === 1 ? 'Eine davon gibt' : `${doppelte} davon gibt`} es in dieser Etappe schon — wird nicht doppelt angelegt.`
                  : 'Keine Doppelten in dieser Etappe.'}
                {istChangeRequest ? ' Die Etappe ist freigegeben: neue Aufgaben laufen als Change Request.' : ''}
              </p>
            </div>
          )}
          {fehler && <p className="text-sm text-status-critical">{fehler}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={anlegen} disabled={!plan.neu.length || laeuft}>{laeuft ? 'Legt an…' : knopfText}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
