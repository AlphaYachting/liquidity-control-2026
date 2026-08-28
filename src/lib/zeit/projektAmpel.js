import { STATUS_COLORS } from '@/components/sprint/sprintConfig';

// Stufen und Schwellen bleiben unverändert: gut < 80 %, eng < 100 %, kritisch ab 100 %.
const FARBE = {
  gut: STATUS_COLORS.doneText,
  eng: STATUS_COLORS.attention,
  kritisch: STATUS_COLORS.critical,
};

const zahl1 = (v) => new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(v || 0);
const proz = (v) => Math.round((v || 0) * 100);
const tagDiff = (vonIso, bisIso) => Math.round((new Date(`${bisIso}T00:00:00`) - new Date(`${vonIso}T00:00:00`)) / 86400000);
const heute = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const stufeAus = (anteil) => (anteil < 0.8 ? 'gut' : anteil < 1 ? 'eng' : 'kritisch');

// Linke Spalte: verbrauchte Stunden gegen Budget.
export function budgetSpalte(budget, kategorie, stundensatz) {
  if (kategorie === 'aufwand') {
    return {
      beschriftung: 'Stundensatz',
      zahl: stundensatz ? `${zahl1(stundensatz)} €` : '—',
      wort: null,
      farbe: null,
      vergleich: `${zahl1(budget?.gebucht)} h bisher gebucht`,
      anteil: null,
    };
  }
  if (!budget || !budget.gesamt) {
    return {
      beschriftung: 'Gebucht',
      zahl: `${zahl1(budget?.gebucht)} h`,
      wort: null,
      farbe: null,
      vergleich: 'kein Budget gepflegt',
      anteil: null,
    };
  }
  const anteil = budget.gebucht / budget.gesamt;
  const stufe = stufeAus(anteil);
  return {
    beschriftung: anteil < 1 ? 'Noch frei' : 'Über Budget',
    zahl: `${zahl1(Math.abs(budget.gesamt - budget.gebucht))} h`,
    wort: stufe === 'gut' ? 'im Plan' : stufe === 'eng' ? 'wird eng' : 'überschritten',
    farbe: FARBE[stufe],
    vergleich: `${proz(anteil)} % von ${zahl1(budget.gesamt)} h`,
    anteil,
  };
}

// Rechte Spalte: verbrauchte Laufzeit gegen Liefertermin.
export function terminSpalte(start, liefertermin) {
  if (!liefertermin) {
    return {
      beschriftung: 'Bis Lieferung',
      zahl: '—',
      wort: null,
      farbe: null,
      vergleich: 'kein Liefertermin gepflegt',
      anteil: null,
    };
  }
  const h = heute();
  const tage = tagDiff(h, liefertermin);
  const spanne = start ? tagDiff(start, liefertermin) : 0;
  const anteil = spanne > 0 ? Math.max(0, (spanne - tage) / spanne) : tage < 0 ? 1.2 : 0;
  const stufe = tage < 0 ? 'kritisch' : stufeAus(anteil);
  const wort = tage < 0
    ? (tage < -14 ? 'Frist überzogen' : 'überfällig')
    : tage <= 7 ? 'diese Woche' : stufe === 'gut' ? 'im Plan' : 'wird eng';
  return {
    beschriftung: tage < 0 ? 'Überfällig seit' : 'Bis Lieferung',
    zahl: `${Math.abs(tage)} ${Math.abs(tage) === 1 ? 'Tag' : 'Tage'}`,
    wort,
    farbe: FARBE[stufe],
    vergleich: spanne > 0 ? `${proz(anteil)} % der Laufzeit` : 'kein Startdatum gepflegt',
    anteil,
  };
}

// Genau EINE Warnzeile, nach fester Rangfolge.
export function warnZeile({ frist, budgetAnteil, laufzeitAnteil }) {
  if (frist?.tage > 120) {
    return { text: `${frist.name}-Datum seit ${frist.tage} Tagen nicht gepflegt`, farbe: STATUS_COLORS.attention };
  }
  if (frist?.tage > 0) {
    return { text: `${frist.name} seit ${frist.tage} Tagen überschritten`, farbe: STATUS_COLORS.critical };
  }
  if (
    typeof budgetAnteil === 'number' &&
    typeof laufzeitAnteil === 'number' &&
    laufzeitAnteil - budgetAnteil > 0.25
  ) {
    return { text: 'Das Projekt liegt zurück — mehr Laufzeit verbraucht als Stunden.', farbe: STATUS_COLORS.attention };
  }
  return null;
}