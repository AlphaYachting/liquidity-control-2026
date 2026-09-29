import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { standardTermin } from '@/lib/sprint/ensureContainer';

const RHYTHMUS_LABEL = { woechentlich: 'wöchentlich', '14taegig': 'alle 14 Tage', monatlich: 'monatlich', manuell: 'manuell' };

// Vorlagen eines angehakten Moduls: einmalige und (bei Container) wiederkehrende.
export default function ModulVorlagenAuswahl({ templates, istContainer, eintrag, onChange }) {
  const einmalig = templates.filter((t) => t.art !== 'routine');
  const routinen = istContainer ? templates.filter((t) => t.art === 'routine') : [];
  const ids = eintrag.template_ids || [];
  const termine = eintrag.erste_termine || {};

  const toggle = (t) => {
    const an = !ids.includes(t.id);
    const erste_termine = { ...termine };
    if (an && t.art === 'routine' && !erste_termine[t.id]) erste_termine[t.id] = standardTermin(t.rhythmus);
    onChange({ ...eintrag, template_ids: an ? [...ids, t.id] : ids.filter((x) => x !== t.id), erste_termine });
  };

  const zeile = (t, extra) => (
    <div key={t.id} className="flex items-center gap-2 text-sm py-1">
      <Checkbox checked={ids.includes(t.id)} onCheckedChange={() => toggle(t)} />
      <span className="flex-1 min-w-0 truncate">{t.title}</span>
      {extra}
    </div>
  );

  return (
    <div className="ml-7 mt-1 mb-2 space-y-2">
      {einmalig.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Einmalig zum Start</p>
          {einmalig.map((t) => zeile(t))}
        </div>
      )}
      {routinen.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Wiederkehrend</p>
          {routinen.map((t) => zeile(t, (
            <>
              <span className="text-xs text-muted-foreground w-24">{RHYTHMUS_LABEL[t.rhythmus] || 'manuell'}</span>
              <Input
                type="date"
                aria-label="erster Termin"
                title="erster Termin"
                className="h-8 w-40 text-sm"
                value={termine[t.id] || standardTermin(t.rhythmus)}
                onChange={(e) => onChange({ ...eintrag, erste_termine: { ...termine, [t.id]: e.target.value } })}
              />
            </>
          )))}
        </div>
      )}
      {einmalig.length + routinen.length === 0 && (
        <p className="text-xs text-muted-foreground">Keine Vorlagen in diesem Modul.</p>
      )}
    </div>
  );
}