import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Neue Aufgabe aus „Mein Tag": Projekt wählen, Titel, optional Termin und Sollstunden.
// Die Aufgabe gehört der angemeldeten Person und landet in der gewählten Etappe des Projekts.
export default function MeinTagNeueAufgabe({ open, onOpenChange, email, projects = [], sprints = [], milestones = [], projektName, onCreated }) {
  const [projectId, setProjectId] = useState('');
  const [milestoneId, setMilestoneId] = useState('');
  const [title, setTitle] = useState('');
  const [termin, setTermin] = useState('');
  const [hours, setHours] = useState('');
  const [saving, setSaving] = useState(false);

  const etappenVon = (pid) => {
    const eigene = sprints.filter((s) => s.project_id === pid);
    const laufend = eigene.filter((s) => s.status === 'laufend');
    const ids = new Set((laufend.length ? laufend : eigene).map((s) => s.id));
    return milestones.filter((m) => ids.has(m.sprint_id)).sort((a, b) => (a.order || 0) - (b.order || 0));
  };
  const waehlbar = projects.filter((p) => etappenVon(p.id).length > 0)
    .sort((a, b) => projektName(a).localeCompare(projektName(b)));
  const etappen = projectId ? etappenVon(projectId) : [];
  const etappe = etappen.find((m) => m.id === milestoneId) || null;

  const waehleProjekt = (pid) => {
    setProjectId(pid);
    const liste = etappenVon(pid);
    setMilestoneId((liste.find((m) => m.released !== true && m.state !== 'freigegeben') || liste[0])?.id || '');
  };

  const zuruecksetzen = () => { setProjectId(''); setMilestoneId(''); setTitle(''); setTermin(''); setHours(''); };

  const save = async () => {
    if (!title.trim() || !etappe) return;
    setSaving(true);
    await base44.entities.Ticket.create({
      milestone_id: etappe.id,
      project_id: projectId,
      title: title.trim(),
      assignee_email: email,
      status: 'offen',
      milestone_state: etappe.state && etappe.state !== 'freigegeben' ? etappe.state : 'produktion',
      // Nach der Freigabe ist jede Aufgabe ein Change Request (wie beim Anlegen auf der Etappe)
      origin: etappe.released === true ? 'change_request' : 'pflicht',
      target_hours: Number(String(hours).replace(',', '.')) || 0,
      ...(termin ? { planned_for: termin } : {}),
      last_status_change: new Date().toISOString(),
    });
    setSaving(false);
    zuruecksetzen();
    onOpenChange(false);
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Neue Aufgabe für mich</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Projekt</Label>
            <Select value={projectId} onValueChange={waehleProjekt}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Projekt wählen" /></SelectTrigger>
              <SelectContent>
                {waehlbar.map((p) => <SelectItem key={p.id} value={p.id}>{projektName(p)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {etappen.length > 1 && (
            <div>
              <Label>Etappe</Label>
              <Select value={milestoneId} onValueChange={setMilestoneId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Etappe wählen" /></SelectTrigger>
                <SelectContent>
                  {etappen.map((m) => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {etappe?.released === true && (
            <p className="text-xs text-muted-foreground">
              Die Etappe ist freigegeben — die Aufgabe wird als Change Request geführt und separat nach Aufwand abgerechnet.
            </p>
          )}
          <div>
            <Label>Titel</Label>
            <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Was ist zu tun?" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Termin (optional)</Label>
              <Input className="mt-1" type="date" value={termin} onChange={(e) => setTermin(e.target.value)} />
            </div>
            <div>
              <Label>Sollstunden (optional)</Label>
              <Input className="mt-1" type="number" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="0" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={save} disabled={!title.trim() || !etappe || saving}>
            {saving ? 'Legt an…' : 'Aufgabe anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
