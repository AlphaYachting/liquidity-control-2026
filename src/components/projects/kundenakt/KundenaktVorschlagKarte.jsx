import React from 'react';
import { Button } from '@/components/ui/button';
import { Handshake, Loader2 } from 'lucide-react';
import { ENTRY_TYPES } from '@/components/projects/kundenakt/kundenaktConfig';

const tag = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('de-AT', {
  weekday: 'short', day: '2-digit', month: '2-digit',
});

// Vorschlag für einen Kundenakt-Eintrag — erscheint im Gesprächsverlauf an der Stelle der Antwort.
export default function KundenaktVorschlagKarte({ vorschlag, speichernd, onUebernehmen, onBearbeiten, onVerwerfen }) {
  const art = ENTRY_TYPES[vorschlag.entry_type] || ENTRY_TYPES.update;
  const Icon = art.icon;

  return (
    <div className="rounded-xl border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${art.color}`}>
          <Icon className="w-3 h-3" /> {art.label}
        </span>
        <span className="text-muted-foreground">{tag(vorschlag.entry_date)}</span>
        {vorschlag.title && <span className="truncate font-medium">{vorschlag.title}</span>}
      </div>

      <p className="text-sm whitespace-pre-wrap">{vorschlag.content}</p>

      {vorschlag.follow_up_text && (
        <p className="text-xs flex items-center gap-1.5">
          <Handshake className="w-3.5 h-3.5 text-status-done shrink-0" />
          Zugesagt: {vorschlag.follow_up_text}
          {vorschlag.follow_up_date && ` · bis ${tag(vorschlag.follow_up_date)}`}
        </p>
      )}

      {vorschlag.hinweis && (
        <p className="text-[11px] text-status-attention">{vorschlag.hinweis}</p>
      )}

      <div className="flex flex-wrap gap-2 pt-0.5">
        <Button size="sm" className="h-7 text-xs gap-1.5" disabled={speichernd} onClick={onUebernehmen}>
          {speichernd && <Loader2 className="w-3 h-3 animate-spin" />}
          In den Kundenakt übernehmen
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={speichernd} onClick={onBearbeiten}>
          Bearbeiten
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" disabled={speichernd}
          onClick={onVerwerfen}>
          Verwerfen
        </Button>
      </div>
    </div>
  );
}