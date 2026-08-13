/**
 * Herleitung: vom Auftragsbestand (Projekt-Cockpit) zum Zahlungseingang (Geldflussrechnung).
 *
 * Das Cockpit zeigt, was abgerechnet werden DARF (Auftragsbestand netto).
 * Die Geldflussrechnung zeigt, was im Planhorizont auf dem Konto ANKOMMT.
 * Die Differenz entsteht in sechs nachvollziehbaren Schritten.
 * Reine Lese-Logik.
 */
import { buildOrderBacklog } from './restructuringEngine';
import { monthKey } from './restructuringFormat';

const num = (v) => Number(v) || 0;

function startOfWeek(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function buildOrderDerivation({
  orders = [], projects = [], invoices = [], setting = {}, plan = {}, planItems = [], pattern = null,
}) {
  const defaultVat = num(setting.default_vat_rate) || 20;
  const backlog = buildOrderBacklog(orders, projects, invoices, defaultVat);
  const projectByOrder = new Map(orders.map((o) => [o.id, o.project_id || null]));

  const weeks = num(plan.weeks) || num(setting.plan_weeks) || 13;
  const startStr = plan.plan_start_date || setting.plan_start_date;
  const weekStart0 = startOfWeek(startStr ? new Date(`${startStr}T00:00:00`) : new Date());
  const weekBoundaries = [];
  for (let w = 0; w < weeks; w++) {
    const s = new Date(weekStart0);
    s.setDate(s.getDate() + w * 7);
    weekBoundaries.push(s);
  }
  const currentMonth = monthKey(new Date());

  // ── Schritt 1/2: Fakturierungsbedarf je Woche, danach Kapazitätsgrenze ──
  const rawByWeek = new Array(weeks).fill(0);
  let datedOutside = 0;
  backlog.rows.forEach((o) => {
    const value = o.remaining_gross;
    if (o.expected_month && o.expected_month >= currentMonth) {
      const idx = weekBoundaries.findIndex((s) => monthKey(s) === o.expected_month && s.getDate() <= 7);
      if (idx >= 0) rawByWeek[idx] += value;
      else datedOutside += value;
    } else {
      for (let w = 0; w < weeks; w++) rawByWeek[w] += value / weeks;
    }
  });

  const cap = num(setting.max_monthly_billing_gross);
  const billingByWeek = new Array(weeks).fill(0);
  const usedByMonth = {};
  let carry = 0;
  for (let w = 0; w < weeks; w++) {
    const mk = monthKey(weekBoundaries[w]);
    const want = rawByWeek[w] + carry;
    const available = cap > 0 ? Math.max(0, cap - (usedByMonth[mk] || 0)) : Infinity;
    const take = Math.min(want, available);
    billingByWeek[w] = take;
    usedByMonth[mk] = (usedByMonth[mk] || 0) + take;
    carry = want - take;
  }
  const billableGross = billingByWeek.reduce((s, v) => s + v, 0);
  const notCoveredGross = carry + datedOutside;
  const totalGross = backlog.totalGross;
  const coverRatio = totalGross > 0 ? billableGross / totalGross : 0;

  // ── Schritt 6: Zahlungseingang im Horizont nach Staffel ────────────────
  const offsets = pattern?.offsets_weeks?.length
    ? pattern.offsets_weeks.map(num)
    : [num(setting.billing_to_cash_weeks ?? 4)];
  const shares = pattern?.shares_percent?.length
    ? pattern.shares_percent.map(num)
    : [100];
  let cashInHorizon = 0;
  billingByWeek.forEach((v, w) => {
    offsets.forEach((off, k) => {
      if (w + off < weeks) cashInHorizon += v * ((shares[k] || 0) / 100);
    });
  });
  const cashRatio = billableGross > 0 ? cashInHorizon / billableGross : 0;

  // ── Schritt 5: Altanteil aus den erfassten Planpositionen ──────────────
  const orderItems = planItems.filter((i) => i.source_type === 'order' || i.category === 'projekt_neuleistung');
  const altGross = orderItems.reduce((s, i) => s + num(i.amount_alt_gross), 0);
  const altCapped = Math.min(altGross, billableGross);
  const neuGross = Math.max(0, billableGross - altCapped);

  // ── Aufträge je Schritt (Drill-down) ──────────────────────────────────
  const rows = backlog.rows.map((o) => ({
    id: o.id,
    project_id: projectByOrder.get(o.id) || null,
    order_number: o.order_number,
    customer: o.customer,
    project_name: o.project_name,
    expected_month: o.expected_month,
    remaining_net: o.remaining,
    remaining_gross: o.remaining_gross,
    billable_gross: o.remaining_gross * coverRatio,
    not_covered_gross: o.remaining_gross * (1 - coverRatio),
    cash_in_horizon_gross: o.remaining_gross * coverRatio * cashRatio,
  }));

  const vatAmount = billableGross - backlog.total * coverRatio;

  const steps = [
    {
      key: 'backlog',
      no: 1,
      label: 'Auftragsbestand offen (netto)',
      amount: backlog.total,
      sign: '',
      note: 'Bestätigte Aufträge abzüglich bereits verrechneter Beträge — der Wert, den das Projekt-Cockpit als abrechenbar ausweist.',
      rows: rows.map((r) => ({ ...r, _amount: r.remaining_net })),
    },
    {
      key: 'not_covered',
      no: 2,
      label: 'abzüglich nicht kapazitätsgedeckt im Planhorizont',
      amount: -(notCoveredGross / (1 + defaultVat / 100)),
      sign: '−',
      note: cap > 0
        ? `Kapazitätsgrenze ${cap.toLocaleString('de-AT')} € brutto je Monat: mehr kann das Team in einem Monat nicht leisten und fakturieren. Der Überhang verschiebt sich über den Planhorizont hinaus.`
        : 'Keine Kapazitätsgrenze gepflegt — es wird der gesamte Auftragsbestand als fakturierbar angesetzt.',
      rows: rows.filter((r) => r.not_covered_gross > 0.01).map((r) => ({ ...r, _amount: -r.not_covered_gross })),
    },
    {
      key: 'billable_net',
      no: 3,
      label: '= abrechenbar im Horizont (netto)',
      amount: backlog.total * coverRatio,
      sign: '=',
      note: 'Anteilig nach Auftragswert auf die Aufträge verteilt.',
      rows: rows.filter((r) => r.billable_gross > 0.01).map((r) => ({ ...r, _amount: r.billable_gross / (1 + defaultVat / 100) })),
    },
    {
      key: 'vat',
      no: 4,
      label: 'zuzüglich Umsatzsteuer',
      amount: vatAmount,
      sign: '+',
      note: `Die Geldflussrechnung führt Bruttowerte — auf dem Konto kommt der Bruttobetrag an (Standardsatz ${defaultVat} %).`,
      rows: [],
    },
    {
      key: 'alt',
      no: 5,
      label: 'abzüglich Altanteil (Leistung bis zum Tag vor dem Stichtag)',
      amount: -altCapped,
      sign: '−',
      note: altCapped > 0
        ? 'Altanteil laut Alt/Neu-Aufteilung der erfassten Planpositionen — zählt nicht zur Neuleistung.'
        : 'In den Planpositionen ist derzeit kein Altanteil aus Aufträgen erfasst.',
      rows: orderItems.filter((i) => num(i.amount_alt_gross) > 0.01).map((i) => ({
        id: i.id, order_number: '—', customer: i.customer_or_supplier || '—',
        project_name: i.label, project_id: null, _amount: -num(i.amount_alt_gross),
      })),
    },
    {
      key: 'cash',
      no: 6,
      label: '= Neuleistung brutto, davon Zahlungseingang im Horizont',
      amount: neuGross * cashRatio,
      sign: '=',
      note: `Neuleistung brutto ${neuGross.toLocaleString('de-AT', { maximumFractionDigits: 0 })} €; nach Zahlungsstaffel `
        + `${pattern?.name ? `„${pattern.name}"` : `${offsets[0]} Wochen Zahlungsziel`} fließen davon ${Math.round(cashRatio * 100)} % noch innerhalb der ${weeks} Planwochen zu.`,
      rows: rows.filter((r) => r.cash_in_horizon_gross > 0.01).map((r) => ({ ...r, _amount: r.cash_in_horizon_gross * (billableGross > 0 ? neuGross / billableGross : 0) })),
    },
  ];

  return {
    steps,
    weeks,
    cap,
    coverRatio,
    cashRatio,
    backlogNet: backlog.total,
    backlogGross: totalGross,
    billableGross,
    notCoveredGross,
    altGross: altCapped,
    neuGross,
    cashInHorizon: neuGross * cashRatio,
    patternName: pattern?.name || null,
  };
}