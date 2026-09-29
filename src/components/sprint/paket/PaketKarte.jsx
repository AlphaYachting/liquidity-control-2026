import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import PersonenChip from '@/components/sprint/PersonenChip';
import { standardTermin } from '@/lib/sprint/ensureContainer';
import RoutineVorlageZeile from './RoutineVorlageZeile';
import { vorlagenVon } from './paketZaehler';

export default function PaketKarte({ modul, templates, istContainer, eintrag, members, standardBetreuer, onChange }) {
  const [setupOffen, setSetupOffen] = useState(false);
  const { routinen, setup } = vorlagenVon(modul.id, templates, istContainer);
  const ids = eintrag.template_ids || [];
  const termine = eintrag.erste_termine || {};
  const betreuer = eintrag.betreuer_email || standardBetreuer;

  const toggle = (t) => {
    const an = !ids.includes(t.id);
    const erste_termine = { ...termine };
    if (an && t.art === 'routine' && !erste_termine[t.id]) erste_termine[t.id] = standardTermin(t.rhythmus);
    onChange({ ...eintrag, template_ids: an ? [...ids, t.id] : ids.filter((x) => x !== t.id), erste_termine });
  };
  const setupAn = setup.filter((t) => ids.includes(t.id)).length;

  return (
    <div className="bg-white border border-border rounded p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-sm font-semibold text-foreground">{modul.name}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Betreuer</span>
          <PersonenChip
            member={members.find((m) => m.email === betreuer)}
            members={members}
            onAssign={(email) => onChange({ ...eintrag, betreuer_email: email })}
          />
        </div>
      </div>
      {routinen.map((t) => (
        <RoutineVorlageZeile
          key={t.id}
          vorlage={t}
          an={ids.includes(t.id)}
          termin={termine[t.id]}
          onToggle={() => toggle(t)}
          onTermin={(d) => onChange({ ...eintrag, erste_termine: { ...termine, [t.id]: d } })}
        />
      ))}
      {setup.length > 0 && (
        <>
          <button type="button" onClick={() => setSetupOffen((v) => !v)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground py-1">
            {setupOffen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Setup · {setupAn} von {setup.length} Aufgaben · anpassen
          </button>
          {setupOffen && setup.map((t) => (
            <label key={t.id} className="flex items-center gap-2 py-1 pl-5 text-sm cursor-pointer">
              <Checkbox checked={ids.includes(t.id)} onCheckedChange={() => toggle(t)} />
              <span className="flex-1 min-w-0 truncate">{t.title}</span>
              {t.optional && <span className="text-xs text-muted-foreground">optional</span>}
            </label>
          ))}
        </>
      )}
      {setup.length + routinen.length === 0 && <p className="text-xs text-muted-foreground">Keine Vorlagen in diesem Modul.</p>}
    </div>
  );
}