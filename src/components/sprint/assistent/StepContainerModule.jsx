import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import SectionLabel from '@/components/sprint/SectionLabel';

// Modulwahl für laufende Behälter (Support, Container, Alt, Intern):
// keine Beträge, keine Termine — nur die Standard-Tickets aus dem Katalog.
export default function StepContainerModule({ modules, moduleIds, setModuleIds, model }) {
  const toggle = (id) =>
    setModuleIds(moduleIds.includes(id) ? moduleIds.filter((x) => x !== id) : [...moduleIds, id]);

  const passend = modules.filter((m) => !m.default_arbeitsmodell || m.default_arbeitsmodell === model);
  const rest = modules.filter((m) => !passend.includes(m));

  const zeile = (m) => (
    <label key={m.id} className="flex items-start gap-3 rounded border border-muted px-4 py-3 cursor-pointer hover:border-primary/40">
      <Checkbox checked={moduleIds.includes(m.id)} onCheckedChange={() => toggle(m.id)} className="mt-0.5" />
      <span className="text-sm">
        <span className="font-semibold text-foreground">{m.name}</span>
        {m.description && <span className="block text-xs text-muted-foreground">{m.description}</span>}
      </span>
    </label>
  );

  return (
    <div className="space-y-4">
      <div>
        <SectionLabel className="mb-2">Standardleistungen für diesen Behälter</SectionLabel>
        <p className="text-xs text-muted-foreground mb-3">
          Die Tickets entstehen aus den Vorlagen der gewählten Module. Ohne Auswahl bleibt der Behälter leer.
        </p>
        <div className="space-y-2">{passend.map(zeile)}</div>
      </div>
      {rest.length > 0 && (
        <div>
          <SectionLabel className="mb-2">Weitere Module</SectionLabel>
          <div className="space-y-2">{rest.map(zeile)}</div>
        </div>
      )}
    </div>
  );
}