export const RHYTHMUS_LABEL = { woechentlich: 'wöchentlich', '14taegig': 'alle 14 Tage', monatlich: 'monatlich', '2monatlich': 'alle 2 Monate', quartalsweise: 'quartalsweise', halbjaehrlich: 'halbjährlich', jaehrlich: 'jährlich', manuell: 'manuell' };

export const vorlagenVon = (moduleId, templates, istContainer) => {
  const eigene = templates.filter((t) => t.module_template_id === moduleId).sort((a, b) => (a.order || 0) - (b.order || 0));
  return {
    routinen: istContainer ? eigene.filter((t) => t.art === 'routine') : [],
    setup: eigene.filter((t) => t.art !== 'routine'),
  };
};

export const kurzinfo = (moduleId, templates, istContainer) => {
  const { routinen, setup } = vorlagenVon(moduleId, templates, istContainer);
  return [
    routinen.length && `${routinen.length} ${routinen.length === 1 ? 'Routine' : 'Routinen'}`,
    setup.length && `${setup.length} Setup`,
  ].filter(Boolean).join(' · ');
};

// Zählt Routinen und Setup-Aufgaben einer Auswahl.
export const zaehle = (auswahl, templates) => {
  let routinen = 0; let setup = 0;
  auswahl.forEach((a) => (a.template_ids || []).forEach((id) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    if (t.art === 'routine') routinen += 1; else setup += 1;
  }));
  return { module: auswahl.length, routinen, setup };
};