import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Trash2, Loader2, Paperclip } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ENTRY_TYPES, formatEntryDate } from '@/components/projects/kundenakt/kundenaktConfig';

// Kundenakt als Timeline nach unten — je Eintrag Symbol, Titel, Zeitpunkt, Inhalt, Dokument.
export default function KundenaktTimeline({ entries, onChanged }) {
  const [deletingId, setDeletingId] = useState(null);

  const deleteEntry = async (e) => {
    if (!window.confirm('Diesen Eintrag endgültig aus dem Kundenakt löschen?')) return;
    setDeletingId(e.id);
    await base44.entities.ProjectFileEntry.delete(e.id);
    setDeletingId(null);
    onChanged?.();
  };

  if (!entries?.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Noch keine Einträge im Kundenakt — Vereinbarungen, Updates und Dokumente hier erfassen.
      </p>
    );
  }

  return (
    <div className="space-y-0">
      {entries.map((e, i) => {
        const meta = ENTRY_TYPES[e.entry_type] || ENTRY_TYPES.update;
        const Icon = meta.icon;
        return (
          <div key={e.id} className="flex gap-3 group">
            <div className="flex flex-col items-center">
              <div className={`p-1.5 rounded-full ${meta.color} shrink-0`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              {i < entries.length - 1 && <div className="w-px flex-1 bg-border my-1" />}
            </div>
            <div className="pb-5 min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium leading-tight">{e.title || meta.label}</p>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] text-muted-foreground">
                    {formatEntryDate(e.entry_date || e.created_date)}
                  </span>
                  <button
                    onClick={() => deleteEntry(e)}
                    disabled={deletingId === e.id}
                    title="Eintrag löschen"
                    className="text-muted-foreground/50 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100"
                  >
                    {deletingId === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-[10px]">{meta.label}</Badge>
                {e.recorded_by && <span className="text-[10px] text-muted-foreground">{e.recorded_by}</span>}
              </div>
              {e.ai_summary && <p className="text-xs mt-1.5">{e.ai_summary}</p>}
              {e.content && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{e.content}</p>}
              {e.file_url && (
                <a href={e.file_url} target="_blank" rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                  <Paperclip className="w-3 h-3" /> {e.file_name || 'Dokument öffnen'}
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}