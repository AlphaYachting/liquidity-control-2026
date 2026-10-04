import React from 'react';
import { ROLES } from '@/components/sprint/sprintConfig';
import { PROJECT_TYPES, PROJECT_TYPE_ORDER } from '@/components/sprint/projectTypes';
import { rolleLabel } from '@/lib/auslastung/auslastungRechnung';

const knopf = (aktiv) => `text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded border ${aktiv ? 'bg-foreground text-background border-foreground' : 'bg-white text-foreground border-border hover:bg-muted'}`;
const auswahl = 'h-8 rounded border border-border bg-white px-2 text-meta';

export default function AuslastungFilter({ pauschal, setPauschal, rolle, setRolle, typ, setTyp }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5">
        <span className="text-meta text-muted-foreground mr-1">Pauschalwert für Tickets ohne Schätzung</span>
        {[0, 1, 2, 4].map((v) => (
          <button key={v} type="button" className={knopf(pauschal === v)} onClick={() => setPauschal(v)}>
            {v === 0 ? 'aus' : `${v} h`}
          </button>
        ))}
      </div>
      <select className={auswahl} value={rolle} onChange={(e) => setRolle(e.target.value)}>
        <option value="alle">Alle Rollen</option>
        {ROLES.map((r) => <option key={r} value={r}>{rolleLabel(r)}</option>)}
      </select>
      <select className={auswahl} value={typ} onChange={(e) => setTyp(e.target.value)}>
        <option value="alle">Alle Projekttypen</option>
        {PROJECT_TYPE_ORDER.map((t) => <option key={t} value={t}>{PROJECT_TYPES[t]?.label || t}</option>)}
      </select>
    </div>
  );
}