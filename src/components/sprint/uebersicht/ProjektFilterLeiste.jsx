import React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { STAND_OPTIONEN } from '@/lib/sprint/projektGruppen';

const chip = (aktiv) =>
  `text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded border ${
    aktiv ? 'bg-foreground text-background border-foreground' : 'bg-white text-muted-foreground border-border hover:bg-muted'
  }`;

// Filterleiste der Projektliste: Meine/Alle · Stand · Suche. Die Typen gliedern die Liste selbst.
export default function ProjektFilterLeiste({
  sicht, onSicht, anzahlSicht,
  stand, onStand, anzahlStand,
  suche, onSuche,
  gesperrt = false,
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex gap-1.5" title={gesperrt ? 'Bei Kundenfilter werden alle Projekte des Kunden gezeigt' : undefined}>
        {[{ key: 'meine', label: 'Meine' }, { key: 'alle', label: 'Alle' }].map((o) => (
          <button
            key={o.key}
            type="button"
            disabled={gesperrt}
            aria-pressed={sicht === o.key}
            onClick={() => onSicht(o.key)}
            className={`${chip(sicht === o.key)} ${gesperrt ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {o.label} ({anzahlSicht[o.key] || 0})
          </button>
        ))}
      </div>

      <div className="flex gap-1.5">
        {STAND_OPTIONEN.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={stand === o.key}
            onClick={() => onStand(o.key)}
            className={chip(stand === o.key)}
          >
            {o.label} ({anzahlStand[o.key] || 0})
          </button>
        ))}
      </div>

      <div className="relative flex-1 min-w-[200px] max-w-[340px] ml-auto">
        <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
        <Input
          className="pl-8 pr-8 bg-white"
          placeholder="In der Liste suchen — Projekt, Kunde, Kürzel"
          value={suche}
          onChange={(e) => onSuche(e.target.value)}
        />
        {suche && (
          <button
            type="button"
            title="Suche leeren"
            onClick={() => onSuche('')}
            className="absolute right-2 top-2 p-0.5 rounded hover:bg-muted"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}
