import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import SectionLabel from '@/components/sprint/SectionLabel';
import { todayIso } from '@/components/sprint/sprintConfig';

// Zeitbuchung auf Projektebene — reiner Indikator, nie Abrechnungsgrundlage.
// Ist ein Focus-Tag gesetzt, ist das Projekt vorbelegt und NICHT änderbar.
export default function ZeitBuchung({ userEmail, fixedProjectId, fixedProjectTitle, projects = [], standardHours = 8, todayEntries = [], projectTitleById = {}, onBooked }) {
  const { toast } = useToast();
  const [projectId, setProjectId] = useState('');
  const [hours, setHours] = useState(String(standardHours));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const effectiveProjectId = fixedProjectId || projectId;

  const handleSave = async () => {
    if (!effectiveProjectId || !Number(hours)) return;
    setSaving(true);
    await base44.entities.TimeEntry.create({
      project_id: effectiveProjectId,
      person_email: userEmail,
      entry_date: todayIso(),
      hours: Number(hours),
      note,
      source: 'bestaetigt',
    });
    setSaving(false);
    setHours(String(standardHours));
    setNote('');
    toast({ description: 'Zeit gebucht.' });
    onBooked?.();
  };

  const bookedTotal = todayEntries.reduce((s, e) => s + (e.hours || 0), 0);

  return (
    <div className="bg-white rounded-lg shadow-sm p-5">
      <SectionLabel className="mb-3">Zeitbuchung</SectionLabel>
      {todayEntries.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-[#2d2d2d]">Heute gebucht: {bookedTotal} h</span>
          {todayEntries.map((e) => (
            <span key={e.id} className="text-xs px-2 py-0.5 rounded-[2px] bg-[#f5f5f5] text-[#6b6b6b]">
              {projectTitleById[e.project_id] || 'Projekt'} · {e.hours} h
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-2">
        {fixedProjectId ? (
          <div className="flex-1 h-9 px-3 rounded border bg-[#f5f5f5] text-sm flex items-center text-[#2d2d2d] font-medium">
            {fixedProjectTitle}
          </div>
        ) : (
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Projekt wählen" /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Input
          type="number" step="0.25" min="0" placeholder="Stunden"
          className="sm:w-28" value={hours} onChange={(e) => setHours(e.target.value)}
        />
        <Input
          placeholder="Notiz (optional)" className="flex-1"
          value={note} onChange={(e) => setNote(e.target.value)}
        />
        <Button
          className="bg-[#ff3764] hover:bg-[#e62e58] text-white font-bold uppercase rounded"
          disabled={saving || !effectiveProjectId || !Number(hours)}
          onClick={handleSave}
        >
          Buchen
        </Button>
      </div>
    </div>
  );
}