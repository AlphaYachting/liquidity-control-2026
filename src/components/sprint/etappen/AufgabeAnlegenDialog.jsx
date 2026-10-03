import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Coins } from 'lucide-react';

const OFFEN = '__offen';
const PHASEN = ['input', 'produktion', 'pruefung', 'kundenfeedback'];

// Eine Aufgabe in einer Etappe des Sprints anlegen. In einer freigegebenen Etappe
// ist jede neue Aufgabe ein Change Request (nach Aufwand, nicht im Festpreis).
export default function AufgabeAnlegenDialog({ open, onOpenChange, milestones = [], tickets = [], members = [], projectId, startEtappeId, onCreated }) {
  const [etappeId, setEtappeId] = useState('');
  const [titel, setTitel] = useState('');
  const [person, setPerson] = useState(OFFEN);
  const [stunden, setStunden] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');

  useEffect(() => {
    if (!open) return;
    setEtappeId(startEtappeId || milestones.find((m) => m.state !== 'freigegeben')?.id || milestones[0]?.id || '');
    setFehler('');
  }, [open, startEtappeId, milestones]);

  const etappe = milestones.find((m) => m.id === etappeId);
  const istChangeRequest = etappe?.released === true || etappe?.state === 'freigegeben';

  const anlegen = async () => {
    if (!titel.trim() || !etappe) return;
    setLaeuft(true);
    setFehler('');
    try {
      const vorhandene = tickets.filter((t) => t.milestone_id === etappe.id);
      await base44.entities.Ticket.create({
        milestone_id: etappe.id,
        project_id: projectId,
        order: vorhandene.reduce((m, t) => Math.max(m, Number(t.order) || 0), 0) + 1,
        title: titel.trim(),
        assignee_email: person === OFFEN ? undefined : person,
        milestone_state: PHASEN.includes(etappe.state) ? etappe.state : 'produktion',
        status: 'offen',
        origin: istChangeRequest ? 'change_request' : 'pflicht',
        target_hours: Number(stunden) || 0,
        last_status_change: new Date().toISOString(),
      });
      onCreated?.(`„${titel.trim()}" in ${etappe.title} angelegt.`, etappe.id);
      setTitel(''); setPerson(OFFEN); setStunden('');
      onOpenChange(false);
    } catch (e) {
      setFehler(e?.message || 'Aufgabe konnte nicht angelegt werden.');
    }
    setLaeuft(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader><DialogTitle>Aufgabe hinzufügen</DialogTitle></DialogHeader>

        {istChangeRequest && (
          <div className="flex gap-2 rounded bg-status-attention-surface p-3 text-sm text-status-attention">
            <Coins className="w-4 h-4 shrink-0 mt-0.5" />
            <p>Die Etappe ist freigegeben — die Aufgabe wird als <strong>Change Request</strong> nach Aufwand geführt und zählt nicht gegen den Festpreis.</p>
          </div>
        )}

        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="aufgabe-titel">Titel</Label>
            <Input id="aufgabe-titel" value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="Was ist zu tun?" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Etappe</Label>
            <Select value={etappeId} onValueChange={setEtappeId}>
              <SelectTrigger><SelectValue placeholder="Etappe wählen" /></SelectTrigger>
              <SelectContent>
                {milestones.map((m) => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1.5 flex-[2_1_200px]">
              <Label>Zuständig</Label>
              <Select value={person} onValueChange={setPerson}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={OFFEN}>nicht zugewiesen</SelectItem>
                  {members.map((m) => <SelectItem key={m.email} value={m.email}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 flex-[1_1_100px]">
              <Label htmlFor="aufgabe-stunden">Planstunden</Label>
              <Input id="aufgabe-stunden" type="number" min="0" step="0.5" value={stunden} onChange={(e) => setStunden(e.target.value)} placeholder="0" />
            </div>
          </div>
          {fehler && <p className="text-sm text-status-critical">{fehler}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={anlegen} disabled={!titel.trim() || !etappe || laeuft}>
            {laeuft ? 'Legt an…' : istChangeRequest ? 'Change Request anlegen' : 'Aufgabe anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
