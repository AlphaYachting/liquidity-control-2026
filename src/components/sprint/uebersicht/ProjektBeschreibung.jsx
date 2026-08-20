import React, { useState } from 'react';
import { Pencil } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

// Briefing / Umfang — direkt an der Stelle bearbeitbar, an der es gelesen wird
export default function ProjektBeschreibung({ project, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(project.description || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await base44.entities.Project.update(project.id, { description: text });
    setSaving(false);
    setEditing(false);
    onSaved?.();
  };

  if (!editing) {
    return (
      <div className="group">
        <p className="text-sm whitespace-pre-wrap text-foreground">
          {project.description || <span className="text-muted-foreground">Noch keine Projektbeschreibung erfasst.</span>}
        </p>
        <button onClick={() => { setText(project.description || ''); setEditing(true); }}
          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <Pencil className="w-3 h-3" /> Beschreibung bearbeiten
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
        placeholder="Briefing, Umfang, Besonderheiten…" />
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={saving}>Speichern</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>Abbrechen</Button>
      </div>
    </div>
  );
}