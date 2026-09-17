// Zuordnung Sprint-Projekt -> Liquiditätsprojekt, gemeinsam genutzt von
// projektHandlungsbedarf und projektStillstand. Erst über den Kunden, bei
// mehreren Projekten desselben Kunden über die grösste Wortüberlappung im Titel.
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const woerter = (s) => (s || '').toLowerCase().split(/[^a-zäöüß0-9]+/).filter(w => w.length > 3);

export function sprintZuordnung({ liqProjekte = [], sprintProjekte = [], clients = [] }) {
  const kundeNachClientId = {};
  for (const c of clients) kundeNachClientId[c.id] = c.name || '';

  const liqNachSprintProjekt = {};
  const typNachLiq = {};

  // sprintProjekte kommen nach '-created_date' — das jüngste Projekt gewinnt.
  for (const sp of sprintProjekte) {
    const kunde = norm(kundeNachClientId[sp.client_id]);
    if (!kunde) continue;
    const kandidaten = liqProjekte.filter(lp => {
      const lpKunde = norm(lp.customer);
      return lpKunde && (lpKunde.includes(kunde) || kunde.includes(lpKunde));
    });
    if (!kandidaten.length) continue;
    let treffer = kandidaten[0];
    if (kandidaten.length > 1) {
      const spWorte = woerter(sp.title);
      let best = -1;
      for (const k of kandidaten) {
        const kWorte = woerter(k.project_name);
        const score = spWorte.filter(w => kWorte.includes(w)).length;
        if (score > best) { best = score; treffer = k; }
      }
    }
    liqNachSprintProjekt[sp.id] = treffer.id;
    if (!typNachLiq[treffer.id]) {
      typNachLiq[treffer.id] = {
        abrechnungsmodell: sp.abrechnungsmodell || null,
        is_legacy: sp.is_legacy === true,
        sprint_project_id: sp.id,
      };
    }
  }

  return { liqNachSprintProjekt, typNachLiq };
}