import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fmtDate } from '@/components/sprint/sprintConfig';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Arbeitstage im Zeitraum — eine Urlaubswoche ist eine Eingabe, nicht fünf
function workdaysInRange(fromIso, toIso) {
  const days = [];
  const d = new Date(`${fromIso}T00:00:00`);
  const end = new Date(`${(toIso || fromIso)}T00:00:00`);
  while (d <= end) {
    if (![0, 6].includes(d.getDay())) days.push(iso(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

// Zuweisung eines Focus-Tags: Person fix, Typ, Projekt und Zeitraum wählbar.
// Ein FocusDay je Person und Tag — eine neue Zuweisung überschreibt die alte.
export default function FocusDayDialog({ open, onOpenChange, personEmail, day, existing, projects = [], onSaved }) {
  const [type, setType] = useState('focus');
  const [projectId, setProjectId] = useState('');
  const [until, setUntil] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setType(existing?.type || 'focus');
      setProjectId(existing?.project_id || '');
      setUntil(existing?.until || '');
    }
  }, [open, existing]);

  const valid = type !== 'focus' || projectId;

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    const days = workdaysInRange(day, until && until > day ? until : day);
    const lastDay = days[days.length - 1];

    // Eindeutigkeit erzwingen: bestehende Zuweisungen im Zeitraum entfernen
    const clashes = await base44.entities.FocusDay.filter(
      { person_email: personEmail, day: { $gte: days[0], $lte: lastDay } }, 'day', 200,
    );
    for (const c of clashes) await base44.entities.FocusDay.delete(c.id);

    await base44.entities.FocusDay.bulkCreate(
      days.map((d) => ({
        person_email: personEmail,
        day: d,
        until: days.length > 1 ? lastDay : undefined,
        type,
        project_id: type === 'focus' ? projectId : '',
      })),
    );
    setSaving(false);
    onOpenChange(false);
    onSaved?.();
  };

  const handleDelete = async () => {
    setSaving(true);
    await base44.entities.FocusDay.delete(existing.id);
    setSaving(false);
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="uppercase font-bold text-[#2d2d2d]">
            Tag zuweisen — {fmtDate(day)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-[#999999]">{personEmail}</p>
          <div>
            <Label>Typ</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="focus">Focus-Tag</SelectItem>
                <SelectItem value="reaktion">Reaktionstag</SelectItem>
                <SelectItem value="abwesend">Abwesend</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type === 'focus' && (
            <div>
              <Label>Projekt</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="Projekt wählen" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Bis (optional)</Label>
            <Input type="date" min={day} value={until} onChange={(e) => setUntil(e.target.value)} />
            <p className="text-[11px] text-[#999999] mt-1">
              Für mehrere Tage, z. B. eine Urlaubswoche. Bestehende Zuweisungen im Zeitraum werden überschrieben.
            </p>
          </div>
          <div className="flex gap-2">
            {existing?.id && (
              <Button variant="outline" className="flex-1" disabled={saving} onClick={handleDelete}>
                Entfernen
              </Button>
            )}
            <Button
              className="flex-1 bg-[#ff3764] hover:bg-[#e62e58] text-white font-bold uppercase rounded"
              disabled={saving || !valid} onClick={handleSave}
            >
              Speichern
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}