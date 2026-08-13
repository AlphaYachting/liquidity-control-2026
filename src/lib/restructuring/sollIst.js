// Soll-Ist-Vergleich der 13-Wochen-Rechnung.
// Plan-Werte kommen aus build13Week, Ist-Werte aus WeeklyActual.
// Wochen ohne Ist-Erfassung bleiben leer (null) und werden nie als 0 gerechnet.

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

export const VARIANCE_THRESHOLD = 10; // Prozent

export function variancePercent(plan, actual) {
  if (actual === null || plan === null) return null;
  if (Math.abs(plan) < 0.005) return actual === 0 ? 0 : null;
  return ((actual - plan) / Math.abs(plan)) * 100;
}

export const isSignificant = (pct) => pct !== null && Math.abs(pct) > VARIANCE_THRESHOLD;

export function buildSollIst({ weekRows = [], actuals = [], hearingDate = null }) {
  const byWeek = new Map(actuals.map((a) => [Number(a.week_index), a]));
  const hearing = hearingDate ? new Date(hearingDate + 'T00:00:00') : null;

  const rows = weekRows.map((w, idx) => {
    const weekIndex = idx + 1;
    const a = byWeek.get(weekIndex) || null;
    const actIn = a ? num(a.actual_inflow_gross) : null;
    const actOut = a ? num(a.actual_outflow_gross) : null;
    const actBal = a ? num(a.actual_bank_balance) : null;
    const weekEnd = new Date(w.week_end + 'T00:00:00');
    return {
      week_index: weekIndex,
      week_start: w.week_start,
      week_end: w.week_end,
      is_hearing_week: w.is_hearing_week,
      in_proof_period: hearing ? weekEnd <= hearing : false,
      plan_inflow: w.inflow,
      plan_outflow: w.outflow,
      plan_closing: w.closing,
      actual: a,
      actual_inflow: actIn,
      actual_outflow: actOut,
      actual_balance: actBal,
      actual_inflow_neu: a ? num(a.actual_inflow_neu_gross) : null,
      variance_reason: a?.variance_reason || '',
      var_inflow: variancePercent(w.inflow, actIn),
      var_outflow: variancePercent(w.outflow, actOut),
      var_balance: variancePercent(w.closing, actBal),
      has_actual: !!a,
    };
  });

  rows.forEach((r) => {
    const flags = [r.var_inflow, r.var_outflow, r.var_balance].filter(isSignificant);
    r.needs_reason = flags.length > 0 && !r.variance_reason.trim();
  });

  const proof = rows.filter((r) => r.in_proof_period);
  const sum = (arr, key) => arr.reduce((s, r) => s + (r[key] || 0), 0);
  const sumActual = (arr, key) => arr.filter((r) => r[key] !== null).reduce((s, r) => s + r[key], 0);

  const planIn = sum(proof, 'plan_inflow');
  const planOut = sum(proof, 'plan_outflow');
  const actualRows = proof.filter((r) => r.has_actual);
  const actIn = sumActual(actualRows, 'actual_inflow');
  const actOut = sumActual(actualRows, 'actual_outflow');
  const hasActuals = actualRows.length > 0;

  return {
    rows,
    proofWeeks: proof.length,
    recordedWeeks: actualRows.length,
    totals: {
      plan_inflow: planIn,
      plan_outflow: planOut,
      plan_surplus: planIn - planOut,
      plan_coverage: planOut > 0 ? (planIn / planOut) * 100 : null,
      actual_inflow: hasActuals ? actIn : null,
      actual_outflow: hasActuals ? actOut : null,
      actual_surplus: hasActuals ? actIn - actOut : null,
      actual_coverage: hasActuals && actOut > 0 ? (actIn / actOut) * 100 : null,
    },
  };
}