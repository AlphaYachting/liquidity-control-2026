import { STATE_LABELS, MILESTONE_STATES, fmtDate, todayIso } from '@/components/sprint/sprintConfig';

export const kurzDatum = (d) => (d ? fmtDate(d).slice(0, 6) : '—');

// Ganze Tage von heute bis zum Datum (negativ = vorbei)
export const tageBis = (d, heute = todayIso()) =>
  (d ? Math.round((new Date(d) - new Date(heute)) / 86400000) : null);

const tageText = (n) => (n === 1 ? '1 Tag' : `${n} Tage`);

// Kennzahlen im Kopf der Etappenseite: Zustand, nächste Frist, Freeze, Betrag, Aufgaben.
// Eine Quelle für Kopf und Aufgabenpanel, damit beide dieselben Daten zeigen.
export function etappeKennzahlen({ milestone, tickets = [] }) {
  const state = milestone.state || 'input';
  const idx = Math.max(0, MILESTONE_STATES.indexOf(state));
  const freigegeben = state === 'freigegeben';
  const feedback = state === 'kundenfeedback';

  const zustand = {
    label: STATE_LABELS[state] || state,
    hint: freigegeben
      ? `am ${fmtDate(milestone.released_at || milestone.updated_date)}`
      : `Phase ${idx + 1} von ${MILESTONE_STATES.length}`,
    erledigt: freigegeben,
  };

  // Vor der Übergabe zählt das Übergabedatum, im Kundenfeedback die Kundenfrist.
  let frist;
  if (feedback) {
    const datum = milestone.feedback_deadline || milestone.planned_freeze;
    const rest = tageBis(datum);
    frist = {
      label: 'Kundenfrist',
      wert: datum ? `bis ${kurzDatum(datum)}` : 'offen',
      hint: rest === null ? 'noch nicht gestartet' : rest > 0 ? `noch ${tageText(rest)}` : rest === 0 ? 'heute letzter Tag' : 'Frist abgelaufen',
      kritisch: rest !== null && rest <= 0,
    };
  } else if (freigegeben) {
    const datum = milestone.handover_date || milestone.planned_handover;
    frist = { label: 'Übergabe', wert: kurzDatum(datum), hint: 'übergeben', kritisch: false };
  } else {
    const datum = milestone.handover_date || milestone.planned_handover;
    const rest = tageBis(datum);
    frist = {
      label: 'Übergabe',
      wert: kurzDatum(datum),
      hint: rest === null ? 'kein Termin geplant' : rest > 0 ? `in ${tageText(rest)}` : rest === 0 ? 'heute' : `${tageText(-rest)} überschritten`,
      kritisch: rest !== null && rest < 0,
    };
  }

  const freeze = {
    wert: kurzDatum(milestone.feedback_deadline || milestone.planned_freeze),
    hint: 'Kundenfeedback bis',
  };

  const erledigt = tickets.filter((t) => t.status === 'erledigt').length;
  // „bis zur Übergabe" zählt nur die Arbeitsphasen — Aufgaben im Kundenfeedback kommen danach.
  const bisUebergabe = tickets.filter(
    (t) => ['input', 'produktion', 'pruefung'].includes(t.milestone_state || 'produktion') && t.status !== 'erledigt',
  ).length;

  return {
    zustand,
    frist,
    freeze,
    aufgaben: {
      erledigt,
      gesamt: tickets.length,
      pct: tickets.length ? Math.round((erledigt / tickets.length) * 100) : 0,
      bisUebergabe,
    },
  };
}
