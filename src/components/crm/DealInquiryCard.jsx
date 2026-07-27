import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Pencil, Check, X } from 'lucide-react';

// Prominente Darstellung der eigentlichen Anfrage (Beschreibung) mit Inline-Bearbeitung
export default function DealInquiryCard({ deal, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(deal.description || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await base44.entities.CrmDeal.update(deal.id, { description: text });
    setSaving(false);
    setEditing(false);
    onChanged?.();
  };

  return (
    <div className="border rounded-xl bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" /> Anfrage
        </h3>
        {!editing ? (
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-muted-foreground" onClick={() => { setText(deal.description || ''); setEditing(true); }}>
            <Pencil className="w-3.5 h-3.5" /> Bearbeiten
          </Button>
        ) : (
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(false)}>
              <X className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" className="h-7 gap-1.5" onClick={save} disabled={saving}>
              <Check className="w-3.5 h-3.5" /> {saving ? 'Speichert…' : 'Speichern'}
            </Button>
          </div>
        )}
      </div>
      {editing ? (
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className="text-sm" placeholder="Worum geht es in dieser Anfrage?" />
      ) : deal.description ? (
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{deal.description}</p>
      ) : (
        <p className="text-sm text-muted-foreground italic">Noch keine Anfrage-Beschreibung hinterlegt — über „Bearbeiten" hinzufügen.</p>
      )}
      {deal.notes && (
        <div className="mt-3 pt-3 border-t">
          <p className="text-xs font-medium text-muted-foreground mb-1">Notizen</p>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">{deal.notes}</p>
        </div>
      )}
    </div>
  );
}