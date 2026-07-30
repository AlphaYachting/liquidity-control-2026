import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fmtDate } from '@/components/sprint/sprintConfig';

// Zuweisung eines Focus-Tags: Person + Tag fix, Typ und Projekt wählbar
export default function FocusDayDialog({ open, onOpenChange, personEmail, day, existing, projects = [], onSaved }) {
  const [type, setType] = useState('focus');
  const [projectId, setProjectId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setType(existing?.type || 'focus');
      setProjectId(existing?.project_id || '');
    }
  }, [open, existing]);

  const valid = type !== 'focus' || projectId;

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    const data = { person_email: personEmail, day, type, project_id: type === 'focus' ? projectId : '' };
    if (existing?.id) await base44.entities.FocusDay.update(existing.id, data);
    else await base44.entities.FocusDay.create(data);
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