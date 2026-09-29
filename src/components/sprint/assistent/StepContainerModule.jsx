import React, { useEffect } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import SectionLabel from '@/components/sprint/SectionLabel';
import ModulVorlagenAuswahl from '@/components/sprint/assistent/ModulVorlagenAuswahl';
import { standardAuswahl } from '@/lib/sprint/ensureContainer';

// Modulwahl für laufende Behälter (Support, Container, Alt, Intern).
// value/onChange tragen die auswahl-Struktur für modulTicketsAnlegen.
export default function StepContainerModule({
  modules, ticketTemplates = [], projektTyp, standardBetreuer, members = [], bereitsVorhandeneModulIds = [], zusatzModulIds = [], value = [], onChange,
}) {
  const istContainer = projektTyp === 'container';
  const model = projektTyp === 'support' ? 'support' : 'container';
  const sichtbar = modules.filter((m) => !bereitsVorhandeneModulIds.includes(m.id));

  useEffect(() => {
    if (value.length) return;
    const ids = [...new Set([...sichtbar.filter((m) => m.vorausgewaehlt).map((m) => m.id), ...zusatzModulIds])]
      .filter((id) => sichtbar.some((m) => m.id === id));
    if (ids.length) onChange(ids.map((id) => standardAuswahl(id, ticketTemplates, istContainer, standardBetreuer)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eintragVon = (id) => value.find((a) => a.module_template_id === id);
  const toggle = (id) => onChange(eintragVon(id)
    ? value.filter((a) => a.module_template_id !== id)
    : [...value, standardAuswahl(id, ticketTemplates, istContainer, standardBetreuer)]);
  const setzeEintrag = (e) => onChange(value.map((a) => (a.module_template_id === e.module_template_id ? e : a)));

  const passend = sichtbar.filter((m) => !m.default_arbeitsmodell || m.default_arbeitsmodell === model);
  const rest = sichtbar.filter((m) => !passend.includes(m));

  const zeile = (m) => {
    const eintrag = eintragVon(m.id);
    return (
      <div key={m.id} className="rounded border border-muted px-4 py-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox checked={!!eintrag} onCheckedChange={() => toggle(m.id)} className="mt-0.5" />
          <span className="text-sm">
            <span className="font-semibold text-foreground">{m.name}</span>
            {m.description && <span className="block text-xs text-muted-foreground">{m.description}</span>}
          </span>
        </label>
        {eintrag && (
          <ModulVorlagenAuswahl
            templates={ticketTemplates.filter((t) => t.module_template_id === m.id)}
            istContainer={istContainer}
            eintrag={eintrag}
            members={members}
            onChange={setzeEintrag}
          />
        )}
      </div>
    );
  };

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