import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Coins } from 'lucide-react';
import { STATE_LABELS } from '@/components/sprint/sprintConfig';

const ROLES = ['Beratung', 'Konzept', 'Text', 'Grafik', 'Web', 'Media', 'QS'];
const PHASES = ['input', 'produktion', 'pruefung', 'kundenfeedback'];

// Aufgabe auf einer Etappe anlegen. Nach der Freigabe ist jede Aufgabe zwingend
// ein Change Request und damit Zusatzumsatz — sie zählt nicht gegen den Festpreis.
export default function NeueAufgabeDialog({ open, onOpenChange, milestone, tickets, members, previousMilestone, onCreated }) {
  const [title, setTitle] = useState('');
  const [role, setRole] = useState('');
  const [phase, setPhase] = useState(milestone.state === 'freigegeben' ? 'produktion' : milestone.state || 'produktion');
  const [assignee, setAssignee] = useState('');
  const [hours, setHours] = useState('');
  const [saving, setSaving] = useState(false);

  const isChangeRequest = milestone.released === true;
  const dependencyWarning = previousMilestone && previousMilestone.released !== true
    ? `Phase ${milestone.order} startet, bevor Phase ${previousMilestone.order} eingefroren ist.`
    : null;

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await base44.entities.Ticket.create({
      milestone_id: milestone.id,
      project_id: milestone.project_id || tickets[0]?.project_id,
      order: (tickets.length || 0) + 1,
      title: title.trim(),
      role: role || undefined,
      assignee_email: assignee || undefined,
      milestone_state: phase,
      status: 'offen',
      origin: isChangeRequest ? 'change_request' : 'pflicht',
      target_hours: Number(hours) || 0,
      last_status_change: new Date().toISOString(),
    });
    setSaving(false);
    setTitle(''); setRole(''); setAssignee(''); setHours('');
    onOpenChange(false);
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Aufgabe hinzufügen</DialogTitle></DialogHeader>

        {isChangeRequest && (
          <div className="flex gap-2 rounded border-l-4 border-primary bg-primary/5 p-3 text-sm">
            <Coins className="w-4 h-4 shrink-0 text-primary mt-0.5" />
            <p>
              Die Etappe ist freigegeben — diese Aufgabe wird als <strong>Change Request</strong> geführt und ist
              <strong> nach Aufwand abrechenbar</strong>. Sie zählt nicht gegen den Sprint-Festpreis.
            </p>
          </div>
        )}

        {dependencyWarning && (
          <div className="flex gap-2 rounded border-l-4 border-status-attention bg-status-attention-surface p-3 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0 text-status-attention mt-0.5" />
            <p>{dependencyWarning}</p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label>Titel</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Was ist zu tun?" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phase</Label>
              <Select value={phase} onValueChange={setPhase}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PHASES.map((p) => <SelectItem key={p} value={p}>{STATE_LABELS[p]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fachrolle</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="offen" /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Zuständig</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="offen" /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => <SelectItem key={m.email} value={m.email}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sollstunden</Label>
              <Input type="number" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="0" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={save} disabled={!title.trim() || saving}>
            {saving ? 'Legt an…' : isChangeRequest ? 'Change Request anlegen' : 'Aufgabe anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}