/**
 * continuationProof.js — Fortführungsnachweis (strenge Lesart).
 *
 * Gegenübergestellt werden ausschließlich:
 *  - Einzahlungen aus NEULEISTUNG (amount_neu_gross der inflow-Positionen)
 *  - Masseverbindlichkeiten (outflow, is_masseverbindlichkeit = true, scenario_only = false)
 * Alt-Positionen bleiben bewusst außen vor.
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const addDays = (dateStr, days) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / 86400000);

/** Wochenraster ab Planbeginn */
export function buildWeeks(planStart, weekCount) {
  return Array.from({ length: weekCount }, (_, i) => ({
    index: i + 1,
    start: addDays(planStart, i * 7),
    end: addDays(planStart, i * 7 + 6),
  }));
}

const weekIndexForDate = (planStart, weekCount, dateStr) => {
  if (!dateStr) return null;
  const diff = daysBetween(planStart, dateStr);
  if (diff < 0) return 1; // Vergangenes fällt in Woche 1
  const idx = Math.floor(diff / 7) + 1;
  return idx > weekCount ? null : idx;
};

/**
 * Verteilt einen Betrag einer Position auf Planwochen.
 * Reihenfolge: feste Planwoche → Zahlungsstaffel ab Rechnungswoche → Rechnungswoche.
 */
function distribute(item, amount, planStart, weekCount, patternById, defaultPatternId) {
  const out = [];
  if (!amount) return out;

  if (item.fixed_week_index) {
    const w = Number(item.fixed_week_index);
    if (w >= 1 && w <= weekCount) out.push({ week: w, amount });
    return out;
  }

  const invoiceWeek = weekIndexForDate(planStart, weekCount, item.invoice_date);
  if (!invoiceWeek) return out; // ohne Termin nicht planbar

  const pattern = patternById[item.payment_pattern_id] || patternById[defaultPatternId];
  const offsets = pattern?.offsets_weeks || [];
  const shares = pattern?.shares_percent || [];
  if (offsets.length && offsets.length === shares.length) {
    offsets.forEach((off, i) => {
      const w = invoiceWeek + Number(off);
      if (w >= 1 && w <= weekCount) out.push({ week: w, amount: (amount * (Number(shares[i]) || 0)) / 100 });
    });
    return out;
  }

  out.push({ week: invoiceWeek, amount });
  return out;
}

export function buildContinuationProof({ plan, items = [], patterns = [], setting = null }) {
  const planStart = plan?.plan_start_date || setting?.plan_start_date || new Date().toISOString().slice(0, 10);
  const weekCount = Number(plan?.weeks) || Number(setting?.plan_weeks) || 13;
  const hearingDate = setting?.reporting_hearing_date || null;

  const patternById = {};
  patterns.forEach((p) => { patternById[p.id] = p; });
  const defaultPatternId = setting?.default_payment_pattern_id;

  const weeks = buildWeeks(planStart, weekCount).map((w) => ({ ...w, inflow_neu: 0, outflow_masse: 0, scenario_out: 0 }));
  const add = (weekNo, field, amount) => {
    const w = weeks[weekNo - 1];
    if (w) w[field] += amount;
  };

  let unscheduled = 0;

  items.forEach((it) => {
    if (it.direction === 'inflow') {
      const amount = Number(it.amount_neu_gross) || 0;
      if (amount <= 0) return;
      const parts = distribute(it, amount, planStart, weekCount, patternById, defaultPatternId);
      if (parts.length === 0) { unscheduled += 1; return; }
      parts.forEach((p) => add(p.week, 'inflow_neu', p.amount));
    } else {
      const amount = Number(it.amount_gross) || 0;
      if (amount <= 0) return;
      const parts = distribute(it, amount, planStart, weekCount, patternById, defaultPatternId);
      if (parts.length === 0) { unscheduled += 1; return; }
      const field = it.scenario_only ? 'scenario_out' : (it.is_masseverbindlichkeit === false ? null : 'outflow_masse');
      if (!field) return;
      parts.forEach((p) => add(p.week, field, p.amount));
    }
  });

  const hearingWeek = hearingDate ? weekIndexForDate(planStart, weekCount, hearingDate) : null;

  let cumIn = 0;
  let cumOut = 0;
  let cumScenario = 0;
  let turningPoint = null;

  const rows = weeks.map((w) => {
    cumIn += w.inflow_neu;
    cumOut += w.outflow_masse;
    cumScenario += w.scenario_out;
    const coverage = cumOut > 0 ? (cumIn / cumOut) * 100 : null;
    if (turningPoint === null && cumOut > 0 && cumIn >= cumOut) turningPoint = w.index;
    return {
      index: w.index,
      start: w.start,
      end: w.end,
      outflow_masse: round2(w.outflow_masse),
      inflow_neu: round2(w.inflow_neu),
      net: round2(w.inflow_neu - w.outflow_masse),
      cum_outflow: round2(cumOut),
      cum_inflow: round2(cumIn),
      cum_gap: round2(cumIn - cumOut),
      coverage_percent: coverage === null ? null : round2(coverage),
      is_hearing_week: hearingWeek === w.index,
      cum_outflow_with_scenario: round2(cumOut + cumScenario),
      cum_gap_with_scenario: round2(cumIn - cumOut - cumScenario),
      coverage_percent_with_scenario: cumOut + cumScenario > 0 ? round2((cumIn / (cumOut + cumScenario)) * 100) : null,
    };
  });

  // Kennzahlen bis zur Vorwoche der Berichtstagsatzung
  const hearingRow = hearingWeek && hearingWeek > 1 ? rows[hearingWeek - 2] : null;
  const lastRow = rows[rows.length - 1] || null;

  const scenarioItems = items.filter((i) => i.direction === 'outflow' && i.scenario_only);
  const scenarioTotal = round2(scenarioItems.reduce((s, i) => s + (Number(i.amount_gross) || 0), 0));
  const scenarioUntilHearing = round2(
    scenarioItems.reduce((s, i) => {
      const parts = distribute(i, Number(i.amount_gross) || 0, planStart, weekCount, patternById, defaultPatternId);
      const limit = hearingWeek ? hearingWeek - 1 : weekCount;
      return s + parts.filter((p) => p.week <= limit).reduce((a, p) => a + p.amount, 0);
    }, 0),
  );

  let turningPointWithScenario = null;
  rows.forEach((r) => {
    if (turningPointWithScenario === null && r.cum_outflow_with_scenario > 0 && r.cum_gap_with_scenario >= 0) {
      turningPointWithScenario = r.index;
    }
  });

  return {
    planStart,
    weekCount,
    hearingDate,
    hearingWeek,
    rows,
    unscheduled,
    base: {
      coverage_until_hearing: hearingRow?.coverage_percent ?? null,
      gap_until_hearing: hearingRow?.cum_gap ?? null,
      coverage_full: lastRow?.coverage_percent ?? null,
      result_full: lastRow?.cum_gap ?? null,
      turning_point: turningPoint,
    },
    scenario: {
      items: scenarioItems,
      total: scenarioTotal,
      until_hearing: scenarioUntilHearing,
      coverage_until_hearing: hearingRow?.coverage_percent_with_scenario ?? null,
      gap_until_hearing: hearingRow?.cum_gap_with_scenario ?? null,
      coverage_full: lastRow?.coverage_percent_with_scenario ?? null,
      result_full: lastRow?.cum_gap_with_scenario ?? null,
      turning_point: turningPointWithScenario,
    },
  };
}

/** Rechtliche Einordnung und Zuständigkeit der Szenariopositionen */
export const SCENARIO_INFO = {
  verwalterentlohnung: {
    einordnung: 'Masseforderung, vorrangig zu befriedigen',
    festgelegt_von: 'Insolvenzgericht auf Antrag des Verwalters',
  },
  verfahrenskosten: {
    einordnung: 'Masseforderung, vorrangig zu befriedigen',
    festgelegt_von: 'Insolvenzgericht',
  },
  gf_bezug: {
    einordnung: 'Masseverbindlichkeit bei Fortführung',
    festgelegt_von: 'Verwalter im Einvernehmen mit dem Gericht',
  },
};