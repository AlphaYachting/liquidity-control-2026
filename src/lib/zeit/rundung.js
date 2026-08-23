// Die EINZIGE Rundungslogik der Anwendung. Gerundet wird nur für Anzeige und Abrechnung,
// niemals vor dem Speichern — duration_minutes trägt immer die echte Minutenzahl.

// Voreinstellungen je Abrechnungsmodell. Setting (Gruppe 'abrechnung') überschreibt sie,
// ein Wert am Projekt überschreibt beides.
export const RUNDUNG_VORGABEN = {
  aufwand: { rundung_minuten: 15, rundung_art: 'auf', rundung_basis: 'tag_projekt', mindestbuchung_minuten: 0 },
  support: { rundung_minuten: 15, rundung_art: 'auf', rundung_basis: 'buchung', mindestbuchung_minuten: 15 },
  sprint: { rundung_minuten: 0, rundung_art: 'auf', rundung_basis: 'tag_projekt', mindestbuchung_minuten: 0 },
  paket: { rundung_minuten: 0, rundung_art: 'auf', rundung_basis: 'tag_projekt', mindestbuchung_minuten: 0 },
  intern: { rundung_minuten: 0, rundung_art: 'auf', rundung_basis: 'tag_projekt', mindestbuchung_minuten: 0 },
};

const FELDER = ['rundung_minuten', 'rundung_art', 'rundung_basis', 'mindestbuchung_minuten'];

// Wirksame Regeln: Projektwert → Setting-Wert → Vorgabe des Abrechnungsmodells.
export function regelnFuer(project, settings = {}) {
  const modell = project?.abrechnungsmodell || 'aufwand';
  const vorgabe = RUNDUNG_VORGABEN[modell] || RUNDUNG_VORGABEN.aufwand;
  const regeln = {};
  for (const f of FELDER) {
    const amProjekt = project?.[f];
    const ausSetting = settings[`${modell}.${f}`];
    regeln[f] = amProjekt !== undefined && amProjekt !== null && amProjekt !== ''
      ? amProjekt
      : (ausSetting !== undefined && ausSetting !== null && ausSetting !== '' ? ausSetting : vorgabe[f]);
  }
  regeln.rundung_minuten = Number(regeln.rundung_minuten) || 0;
  regeln.mindestbuchung_minuten = Number(regeln.mindestbuchung_minuten) || 0;
  return regeln;
}

const runde = (minuten, schritt, art) => {
  if (!schritt || minuten <= 0) return Math.max(0, minuten);
  const teile = minuten / schritt;
  return (art === 'kaufmaennisch' ? Math.round(teile) : Math.ceil(teile)) * schritt;
};

// Verrechnungswert einer Buchung — nur sinnvoll bei Basis 'buchung'.
export function verrechnetJeBuchung(eintrag, regeln) {
  const echt = Number(eintrag.duration_minutes) || 0;
  if (eintrag.verrechenbar === false) return echt;
  return Math.max(runde(echt, regeln.rundung_minuten, regeln.rundung_art), regeln.mindestbuchung_minuten);
}

// Erfasste gegen verrechnete Minuten. Altbuchungen (dauer_geschaetzt) bleiben ausgenommen.
export function verrechneteMinuten(entries = [], project, settings = {}) {
  const regeln = regelnFuer(project, settings);
  const geschaetzt = entries.filter((e) => e.dauer_geschaetzt);
  const zaehlbar = entries.filter((e) => !e.dauer_geschaetzt);
  const erfasst = zaehlbar.reduce((s, e) => s + (Number(e.duration_minutes) || 0), 0);

  const nichtVerrechenbar = zaehlbar
    .filter((e) => e.verrechenbar === false)
    .reduce((s, e) => s + (Number(e.duration_minutes) || 0), 0);
  const verrechenbare = zaehlbar.filter((e) => e.verrechenbar !== false);

  let verrechnetTeil = 0;
  if (regeln.rundung_basis === 'buchung') {
    verrechnetTeil = verrechenbare.reduce((s, e) => s + verrechnetJeBuchung(e, regeln), 0);
  } else {
    const nachTag = verrechenbare.reduce((acc, e) => {
      const k = e.entry_date || 'ohne';
      acc[k] = (acc[k] || 0) + (Number(e.duration_minutes) || 0);
      return acc;
    }, {});
    verrechnetTeil = Object.values(nachTag).reduce(
      (s, min) => s + Math.max(runde(min, regeln.rundung_minuten, regeln.rundung_art), regeln.mindestbuchung_minuten),
      0
    );
  }

  const verrechnet = verrechnetTeil + nichtVerrechenbar;
  return {
    erfasst,
    verrechnet,
    delta: verrechnet - erfasst,
    regeln,
    geschaetztAnzahl: geschaetzt.length,
  };
}

// Buchungen mehrerer Projekte — je Projekt mit den eigenen Regeln gerechnet.
export function verrechneteMinutenGesamt(entries = [], projekteById = {}, settings = {}) {
  const gruppen = entries.reduce((acc, e) => {
    (acc[e.project_id] = acc[e.project_id] || []).push(e);
    return acc;
  }, {});
  return Object.entries(gruppen).reduce((summe, [pid, rows]) => {
    const teil = verrechneteMinuten(rows, projekteById[pid], settings);
    return {
      erfasst: summe.erfasst + teil.erfasst,
      verrechnet: summe.verrechnet + teil.verrechnet,
      delta: summe.delta + teil.delta,
      geschaetztAnzahl: summe.geschaetztAnzahl + teil.geschaetztAnzahl,
    };
  }, { erfasst: 0, verrechnet: 0, delta: 0, geschaetztAnzahl: 0 });
}

// Beispielsatz für die Projektmaske — drei Buchungen von je sieben Minuten.
export function beispielSatz(regeln) {
  const r = { ...regeln, rundung_minuten: Number(regeln.rundung_minuten) || 0, mindestbuchung_minuten: Number(regeln.mindestbuchung_minuten) || 0 };
  if (!r.rundung_minuten && !r.mindestbuchung_minuten) return 'Drei Buchungen von je 7 Minuten bleiben 21 Minuten.';
  const eintraege = [1, 2, 3].map(() => ({ duration_minutes: 7, entry_date: '2026-01-01', verrechenbar: true }));
  const { verrechnet } = verrechneteMinuten(eintraege, {
    abrechnungsmodell: 'aufwand',
    rundung_minuten: r.rundung_minuten,
    rundung_art: r.rundung_art,
    rundung_basis: r.rundung_basis,
    mindestbuchung_minuten: r.mindestbuchung_minuten,
  });
  return `Drei Buchungen von je 7 Minuten werden zu ${verrechnet} Minuten.`;
}