import React, { useEffect, useState } from 'react';
import { standardAuswahl } from '@/lib/sprint/ensureContainer';
import PaketAuswahl from './PaketAuswahl';
import PaketKarte from './PaketKarte';
import { vorlagenVon, zaehle, RHYTHMUS_LABEL } from './paketZaehler';

const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Modulpaket: links auswählen, rechts prüfen.
export default function ModulPaketEditor({
  modules, ticketTemplates = [], projektTyp, standardBetreuer, members = [], bereitsVorhandeneModulIds = [], zusatzModulIds = [], value = [], onChange,
}) {
  const istContainer = projektTyp === 'container';
  const [aufgeklappt, setAufgeklappt] = useState([]);
  const neu = (id) => standardAuswahl(id, ticketTemplates, istContainer, standardBetreuer);

  useEffect(() => {
    if (value.length) return;
    const ids = [...new Set([...modules.filter((m) => m.vorausgewaehlt).map((m) => m.id), ...zusatzModulIds])]
      .filter((id) => modules.some((m) => m.id === id) && !bereitsVorhandeneModulIds.includes(id));
    if (ids.length) onChange(ids.map(neu));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eintragVon = (id) => value.find((a) => a.module_template_id === id);
  const toggle = (id) => onChange(eintragVon(id) ? value.filter((a) => a.module_template_id !== id) : [...value, neu(id)]);
  const setze = (e) => onChange(value.map((a) => (a.module_template_id === e.module_template_id ? e : a)));
  const z = zaehle(value, ticketTemplates);
  const gewaehlt = modules.filter((m) => eintragVon(m.id));
  const kompakt = (m) => m.vorausgewaehlt && !aufgeklappt.includes(m.id) && gleich(eintragVon(m.id), neu(m.id));

  const kompaktText = (m) => {
    const { routinen, setup } = vorlagenVon(m.id, ticketTemplates, istContainer);
    return [m.name, ...routinen.map((t) => `${t.title} ${RHYTHMUS_LABEL[t.rhythmus] || 'manuell'}`),
      setup.length && `Setup ${setup.filter((t) => eintragVon(m.id).template_ids.includes(t.id)).length}/${setup.length}`]
      .filter(Boolean).join(' · ');
  };

  return (
    <div className="grid gap-6 min-[900px]:grid-cols-[240px_1fr] items-start">
      <PaketAuswahl
        modules={modules}
        templates={ticketTemplates}
        projektTyp={projektTyp}
        vorhanden={bereitsVorhandeneModulIds}
        gewaehlt={value.map((a) => a.module_template_id)}
        onToggle={toggle}
      />
      <div className="space-y-2 min-w-0">
        {gewaehlt.length === 0 ? (
          <p className="text-sm text-muted-foreground">Wähle links die Leistungen für diesen Kunden.</p>
        ) : (
          <>
            <p className="text-sm text-foreground">{z.module} Module · {z.routinen} Routinen · {z.setup} Setup-Aufgaben</p>
            {gewaehlt.filter((m) => !kompakt(m)).map((m) => (
              <PaketKarte key={m.id} modul={m} templates={ticketTemplates} istContainer={istContainer} eintrag={eintragVon(m.id)}
                members={members} standardBetreuer={standardBetreuer} onChange={setze} />
            ))}
            {gewaehlt.filter(kompakt).map((m) => (
              <button key={m.id} type="button" onClick={() => setAufgeklappt([...aufgeklappt, m.id])}
                className="block w-full text-left text-xs text-muted-foreground hover:text-foreground border border-border rounded px-3 py-2 truncate">
                {kompaktText(m)}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}