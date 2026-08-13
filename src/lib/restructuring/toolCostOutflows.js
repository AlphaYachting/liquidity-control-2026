/**
 * Auszahlungen der Kategorie hosting_saas werden NICHT mehr manuell erfasst,
 * sondern aus der Tool-Verwaltung (Entity ToolCost) abgeleitet.
 *
 * Regeln:
 *  - Einträge mit needed === false entfallen (nicht benötigt).
 *  - Einträge mit decision_status 'cancel' entfallen; ist ein Kündigungstermin
 *    hinterlegt, laufen sie bis zum Monat davor weiter (Kostenabsprung).
 *  - Zahlungsintervall und Fälligkeitsdatum werden übernommen.
 * Reine Lese-Logik, es werden keine Datensätze geschrieben.
 */
const num = (v) => Number(v) || 0;

const prevMonth = (mk) => {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function deriveHostingOutflows(tools = []) {
  const items = [];
  tools.forEach((t) => {
    if (t.needed === false) return;
    const endMonth = t.cancellation_effective_date ? prevMonth(t.cancellation_effective_date.slice(0, 7)) : null;
    if (t.decision_status === 'cancel' && !endMonth) return;

    const raw = t.payment_interval;
    const monthly = num(t.monthly_cost) || num(t.annual_cost) / 12;
    let amount = monthly;
    let interval = 'monthly';
    if (raw === 'quarterly') {
      amount = num(t.annual_cost) ? num(t.annual_cost) / 4 : monthly * 3;
      interval = 'quarterly';
    } else if (raw === 'yearly') {
      amount = num(t.annual_cost) || monthly * 12;
      interval = 'yearly';
    } else if (raw === 'one_time') {
      amount = num(t.annual_cost) || num(t.monthly_cost);
      interval = 'once';
    }
    if (amount <= 0) return;

    const dueDay = t.due_date ? Number(t.due_date.slice(8, 10)) : 1;
    items.push({
      id: `tool:${t.id}`,
      category: 'hosting_saas',
      label: t.tool_name || 'Tool',
      amount: Math.round(amount * 100) / 100,
      due_day_of_month: Math.min(Math.max(dueDay || 1, 1), 28),
      interval,
      first_due_month: interval === 'monthly' ? null : (t.due_date ? t.due_date.slice(0, 7) : null),
      start_month: null,
      end_month: endMonth,
      is_masseverbindlichkeit: true,
      scenario_only: false,
      is_active: true,
      derived_from_tool: true,
      tool_id: t.id,
      decision_status: t.decision_status || 'undecided',
      cancellation_effective_date: t.cancellation_effective_date || null,
      derivation: `Abgeleitet aus der Tool-Verwaltung: ${t.tool_name || 'Tool'}, `
        + `${interval === 'monthly' ? 'monatlich' : interval === 'quarterly' ? 'quartalsweise' : interval === 'yearly' ? 'jährlich' : 'einmalig'}`
        + `${t.due_date ? `, fällig ${t.due_date}` : ''}`
        + `${endMonth ? `; Kündigung wirksam ${t.cancellation_effective_date}, letzte Fälligkeit ${endMonth}` : ''}.`,
    });
  });
  return items;
}

/** Monatsäquivalent der abgeleiteten Posten (einmalige Posten bleiben außen vor). */
export function monthlyEquivalent(items = []) {
  return items.reduce((s, i) => {
    if (i.interval === 'quarterly') return s + i.amount / 3;
    if (i.interval === 'yearly') return s + i.amount / 12;
    if (i.interval === 'once') return s;
    return s + i.amount;
  }, 0);
}

/** Manuell erfasste Hosting-Posten — Verdacht auf Doppelerfassung. */
export const manualHostingItems = (outflowItems = []) =>
  outflowItems.filter((o) => o.category === 'hosting_saas' && !o.derived_from_tool);