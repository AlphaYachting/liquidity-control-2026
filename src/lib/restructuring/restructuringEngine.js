import { monthKey } from './restructuringFormat';
import { isInvoiceSent } from '../invoiceLiquidityFilter';

/**
 * Zentrale Berechnungs-Engine für das Sanierungs-Reporting.
 * Alle Kennzahlen sind quellennachvollziehbar (Rechnung, Auftrag, awork-Buchung).
 * Reine Lese-Logik — schreibt nie Daten.
 *
 * Eingabe (alle Arrays optional, default []):
 *  projects       LiquidityProject[]
 *  orders         ConfirmedOrder[]
 *  invoices       InvoiceRecord[]
 *  contracts      RecurringContract[]   (Retainer + Hosting + Wartung)
 *  timeEntries    AworkTimeEntry[]
 *  outflowItems   CashOutflowItem[]
 *  bankSnapshots  BankBalanceSnapshot[]
 *  setting        RestructuringSetting
 */

const num = (v) => Number(v) || 0;
const isCancelled = (i) => i?.payment_status === 'cancelled' || i?.status === 'cancelled';

// Alle Beträge der Liquiditätsrechnung sind BRUTTO. Netto-Quellen (ConfirmedOrder,
// RecurringContract) werden mit dem Steuersatz des Datensatzes hochgerechnet,
// hilfsweise mit default_vat_rate aus RestructuringSetting.
export function toGross(netAmount, vatRate, defaultVat = 20) {
  const rate = vatRate === null || vatRate === undefined || vatRate === '' ? num(defaultVat) : num(vatRate);
  return num(netAmount) * (1 + rate / 100);
}

// Einbringlichkeitsannahmen je Altersklasse — pflegbar in RestructuringSetting.
export const DEFAULT_COLLECTION = {
  '0_30': { rate: 90, from: 1, to: 2 },
  '31_60': { rate: 70, from: 1, to: 4 },
  '61_90': { rate: 40, from: 2, to: 6 },
  '90_plus': { rate: 15, from: 4, to: 8 },
};

export function collectionAssumptions(setting = {}) {
  const pick = (v, d) => (v === null || v === undefined || v === '' ? d : Number(v));
  return {
    '0_30': {
      rate: pick(setting.collect_rate_0_30, DEFAULT_COLLECTION['0_30'].rate),
      from: pick(setting.collect_week_from_0_30, DEFAULT_COLLECTION['0_30'].from),
      to: pick(setting.collect_week_to_0_30, DEFAULT_COLLECTION['0_30'].to),
    },
    '31_60': {
      rate: pick(setting.collect_rate_31_60, DEFAULT_COLLECTION['31_60'].rate),
      from: pick(setting.collect_week_from_31_60, DEFAULT_COLLECTION['31_60'].from),
      to: pick(setting.collect_week_to_31_60, DEFAULT_COLLECTION['31_60'].to),
    },
    '61_90': {
      rate: pick(setting.collect_rate_61_90, DEFAULT_COLLECTION['61_90'].rate),
      from: pick(setting.collect_week_from_61_90, DEFAULT_COLLECTION['61_90'].from),
      to: pick(setting.collect_week_to_61_90, DEFAULT_COLLECTION['61_90'].to),
    },
    '90_plus': {
      rate: pick(setting.collect_rate_90_plus, DEFAULT_COLLECTION['90_plus'].rate),
      from: pick(setting.collect_week_from_90_plus, DEFAULT_COLLECTION['90_plus'].from),
      to: pick(setting.collect_week_to_90_plus, DEFAULT_COLLECTION['90_plus'].to),
    },
  };
}

export const BUCKET_LABELS = {
  '0_30': 'fällig ≤ 30 Tage',
  '31_60': '31–60 Tage überfällig',
  '61_90': '61–90 Tage überfällig',
  '90_plus': 'über 90 Tage überfällig',
};

// ── Offene Forderungen (Debitoren) ────────────────────────────────────────
// Nur echte, versendete Forderungen: keine Entwürfe (draft), keine Gutschriften,
// keine Korrekturen, keine stornierten oder bereits bezahlten Rechnungen.
// paid_amount hat Vorrang; bei fehlendem paid_amount gilt Status als Wahrheit.
export function getOpenReceivables(invoices = []) {
  return invoices
    .filter((i) =>
      !isCancelled(i) &&
      !i.is_credit_note &&
      i.invoice_type !== 'correction' &&
      i.payment_status !== 'draft' &&   // Entwürfe sind noch keine Forderung
      isInvoiceSent(i) &&               // nur tatsächlich versendete Rechnungen
      i.payment_status !== 'paid'       // bezahlte raus (Fallback greift unten zusätzlich)
    )
    .map((i) => {
      const gross = num(i.gross_amount);
      // open_amount aus sevDesk hat Vorrang, dann paid-Berechnung
      const openField = num(i.open_amount);
      const paid = num(i.paid_amount);
      let open = openField > 0 ? openField : Math.max(0, gross - paid);
      return { ...i, _open: open };
    })
    .filter((i) => i._open > 0.01);
}

export function effectiveDueDate(inv) {
  if (inv.due_date) return inv.due_date;
  if (inv.invoice_date) {
    const d = new Date(inv.invoice_date);
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

export function agingDays(dueDate, ref = new Date()) {
  if (!dueDate) return 0;
  return Math.floor((ref - new Date(dueDate)) / (1000 * 60 * 60 * 24));
}

export function agingBucket(days) {
  if (days <= 30) return '0_30';
  if (days <= 60) return '31_60';
  if (days <= 90) return '61_90';
  return '90_plus';
}

// ── Forderungsspiegel (Aging + Alt/Neu-Split) ─────────────────────────────
export function buildAging(invoices = [], openingDate = null) {
  const open = getOpenReceivables(invoices);
  const ref = new Date();
  const rows = open.map((i) => {
    const due = effectiveDueDate(i);
    const days = agingDays(due, ref);
    const isPreOpening = openingDate && i.invoice_date && new Date(i.invoice_date) < new Date(openingDate);
    return {
      id: i.id,
      customer: i.customer_name || '—',
      invoice_number: i.invoice_number || '—',
      invoice_date: i.invoice_date || null,
      due_date: due,
      amount: i._open,
      days,
      bucket: agingBucket(days),
      claim_type: openingDate ? (isPreOpening ? 'alt' : 'neu') : 'unbekannt',
    };
  });
  const buckets = { '0_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
  rows.forEach((r) => { buckets[r.bucket] += r.amount; });
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const overdue = rows.filter((r) => r.days > 0).reduce((s, r) => s + r.amount, 0);
  const alt = rows.filter((r) => r.claim_type === 'alt').reduce((s, r) => s + r.amount, 0);
  const neu = rows.filter((r) => r.claim_type === 'neu').reduce((s, r) => s + r.amount, 0);
  return { rows: rows.sort((a, b) => b.days - a.days), buckets, total, overdue, alt, neu };
}

// ── Recurring: Retainer + Hosting + Wartung ───────────────────────────────
function monthlyValueOfContract(c) {
  if (num(c.monthly_fixed_price) > 0) return num(c.monthly_fixed_price);
  const interval = c.billing_interval;
  if (interval === 'yearly' && num(c.annual_amount) > 0) return num(c.annual_amount) / 12;
  if (interval === 'quarterly' && num(c.annual_amount) > 0) return num(c.annual_amount) / 12;
  if (num(c.annual_amount) > 0) return num(c.annual_amount) / 12;
  return 0;
}

export function buildRecurring(contracts = []) {
  const active = contracts.filter((c) => c.status === 'active');
  const rows = active.map((c) => {
    const monthly = monthlyValueOfContract(c);
    return {
      id: c.id,
      customer: c.customer || '—',
      project_name: c.project_name || c.domain || '—',
      contract_type: c.contract_type,
      monthly,
      annual: monthly * 12,
      interval: c.billing_interval,
    };
  }).filter((r) => r.monthly > 0);
  const monthlyTotal = rows.reduce((s, r) => s + r.monthly, 0);
  const annualTotal = monthlyTotal * 12;
  return { rows, monthlyTotal, annualTotal };
}

// ── Auftragsbestand (offene, noch abzuarbeitende Leistung) ────────────────
// Zeigt, was aus bestätigten Aufträgen NOCH nicht abgerechnet ist.
// Korrekturen ggü. Rohdaten:
//  1. Nur Status 'confirmed' (nicht 'completed', nicht 'draft').
//  2. Duplikate (gleicher Kunde + gleiche Summe) werden zusammengeführt.
//  3. Abgerechneter Anteil: primär über confirmed_order_id, sonst als Fallback
//     über Kundenname (viele Rechnungen tragen keine Auftragszuordnung).
const normName = (s) => (s || '').toLowerCase().replace(/gmbh|ges\.?m\.?b\.?h\.?|ag|kg|co\.?|&|\s+/g, '').trim();

export function buildOrderBacklog(orders = [], projects = [], invoices = [], defaultVat = 20) {
  const projById = new Map(projects.map((p) => [p.id, p]));

  // Abgerechnete Netto-Beträge je Auftrag und je Kunde sammeln
  const invByOrder = new Map();
  const invByCustomer = new Map();
  invoices.forEach((i) => {
    if (isCancelled(i) || i.payment_status === 'draft' || !isInvoiceSent(i)) return;
    const net = num(i.net_amount); // Gutschriften/Korrekturen sind hier negativ und reduzieren korrekt
    if (i.confirmed_order_id) {
      invByOrder.set(i.confirmed_order_id, (invByOrder.get(i.confirmed_order_id) || 0) + net);
    }
    const ck = normName(i.customer_name);
    if (ck) invByCustomer.set(ck, (invByCustomer.get(ck) || 0) + net);
  });

  const confirmed = orders.filter((o) => o.status === 'confirmed');

  // Deduplizieren: gleicher Kunde + gleiche Auftragssumme = ein Auftrag
  const seen = new Set();
  const deduped = [];
  confirmed.forEach((o) => {
    const key = normName(o.customer) + '|' + Math.round(num(o.total_net_amount));
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(o);
  });

  // Fallback-Kundenzuordnung anteilig nach Auftragssumme verteilen:
  // Der über den Kundennamen ermittelte fakturierte Betrag wird auf ALLE Aufträge
  // dieses Kunden ohne harte Zuordnung gewichtet aufgeteilt — sonst zählt der
  // zweite Auftrag eines Kunden fälschlich mit vollem Wert als offen.
  const hardByOrder = new Map();
  deduped.forEach((o) => {
    const v = invByOrder.get(o.id) || 0;
    if (v > 0.01) hardByOrder.set(o.id, v);
  });
  const softPoolByCustomer = new Map(); // verbleibender Kundenbetrag
  const softWeightByCustomer = new Map(); // Summe der Auftragssummen ohne harte Zuordnung
  deduped.forEach((o) => {
    const ck = normName(o.customer);
    if (!ck) return;
    if (!softPoolByCustomer.has(ck)) {
      const hardOfCustomer = deduped
        .filter((x) => normName(x.customer) === ck)
        .reduce((s, x) => s + (hardByOrder.get(x.id) || 0), 0);
      softPoolByCustomer.set(ck, Math.max(0, (invByCustomer.get(ck) || 0) - hardOfCustomer));
    }
    if (!hardByOrder.has(o.id)) {
      softWeightByCustomer.set(ck, (softWeightByCustomer.get(ck) || 0) + num(o.total_net_amount));
    }
  });

  const rows = deduped
    .map((o) => {
      const total = num(o.total_net_amount);
      const hard = hardByOrder.get(o.id) || 0;
      let invoiced = hard;
      let estimated = false;
      if (hard <= 0.01) {
        const ck = normName(o.customer);
        const weight = softWeightByCustomer.get(ck) || 0;
        if (ck && weight > 0) {
          const share = (softPoolByCustomer.get(ck) || 0) * (total / weight);
          invoiced = Math.min(total, Math.max(0, share));
          estimated = invoiced > 0.01;
        }
      }
      const remaining = Math.max(0, total - invoiced);
      const grossTotal = num(o.total_gross_amount) > 0
        ? num(o.total_gross_amount)
        : toGross(total, o.vat_rate, defaultVat);
      const grossFactor = total > 0 ? grossTotal / total : 1;
      const proj = o.project_id ? projById.get(o.project_id) : null;
      const expDate = proj?.expected_invoice_date || null;
      const expMonth = proj?.expected_invoice_month || (expDate ? monthKey(expDate) : null);
      return {
        id: o.id,
        order_number: o.order_number || '—',
        customer: o.customer || '—',
        project_name: o.project_name || '—',
        total,
        total_gross: grossTotal,
        invoiced,
        invoiced_estimated: estimated,
        remaining,
        remaining_gross: remaining * grossFactor,
        expected_month: expMonth,
        expected_date: expDate,
      };
    })
    .filter((r) => r.remaining > 0.01);
  const total = rows.reduce((s, r) => s + r.remaining, 0);
  const totalGross = rows.reduce((s, r) => s + r.remaining_gross, 0);
  const estimatedAssigned = rows.filter((r) => r.invoiced_estimated).reduce((s, r) => s + r.invoiced, 0);
  return {
    rows: rows.sort((a, b) => b.remaining - a.remaining),
    total,
    totalGross,
    estimatedAssigned,
    estimatedCount: rows.filter((r) => r.invoiced_estimated).length,
  };
}

// ── WIP / unfertige Leistungen (awork-Stunden × Mischsatz) ────────────────
export function buildWip(timeEntries = [], projects = [], rate = 0, snapshots = []) {
  // Ist-Stunden gesamt (für Budgetvergleich) und unverrechnete Stunden (für WIP-Wert)
  const byProject = new Map();
  timeEntries.forEach((t) => {
    const key = t.awork_project_id || t.project_name || 'unbekannt';
    const cur = byProject.get(key) || {
      key,
      project_name: t.project_name || '—',
      unbilledMinutes: 0,
      totalMinutes: 0,
    };
    cur.totalMinutes += num(t.duration_minutes);
    if (!t.is_billed) cur.unbilledMinutes += num(t.duration_minutes);
    byProject.set(key, cur);
  });
  const projByAwork = new Map(projects.filter((p) => p.awork_project_id).map((p) => [p.awork_project_id, p]));
  const budgetByAwork = new Map(snapshots.filter((s) => s.awork_project_id).map((s) => [s.awork_project_id, num(s.time_budget_minutes)]));

  const rows = Array.from(byProject.values()).map((r) => {
    const hours = r.unbilledMinutes / 60;
    const actualHours = r.totalMinutes / 60;
    const budgetHours = (budgetByAwork.get(r.key) || 0) / 60;
    const overrunPct = budgetHours > 0 ? ((actualHours - budgetHours) / budgetHours) * 100 : null;
    const proj = projByAwork.get(r.key);
    return {
      key: r.key,
      project_name: proj?.project_name || r.project_name,
      hours,
      actualHours,
      budgetHours,
      overrunPct,
      value: hours * rate,
    };
  }).filter((r) => r.hours > 0.01 || r.actualHours > 0.01);
  const totalHours = rows.reduce((s, r) => s + r.hours, 0);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  return { rows: rows.sort((a, b) => b.value - a.value), totalHours, totalValue };
}

// ── Aktive monatliche Auszahlungen ────────────────────────────────────────
export function activeOutflows(outflowItems = [], forMonth = null) {
  return outflowItems.filter((o) => {
    if (o.is_active === false) return false;
    if (forMonth) {
      if (o.start_month && o.start_month > forMonth) return false;
      if (o.end_month && o.end_month < forMonth) return false;
    }
    return true;
  });
}

export function monthlyOutflowTotal(outflowItems = [], forMonth = null) {
  return activeOutflows(outflowItems, forMonth).reduce((s, o) => s + num(o.amount), 0);
}

// Konkrete Fälligkeitstermine eines Auszahlungspostens innerhalb des Planhorizonts.
// Berechnet aus interval, first_due_month und due_day_of_month, begrenzt durch
// start_month/end_month. Termine außerhalb des Horizonts entfallen ersatzlos.
const addMonths = (mk, n) => {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function outflowDueDates(item, planStart, planEnd) {
  const day = Math.min(Math.max(num(item.due_day_of_month) || 1, 1), 28);
  const interval = item.interval || 'monthly';
  const mkToDate = (mk) => {
    const [y, m] = mk.split('-').map(Number);
    return new Date(y, m - 1, day);
  };
  const startMk = monthKey(planStart);
  const endMk = monthKey(new Date(planEnd.getTime() - 1));
  const dates = [];

  if (interval === 'once') {
    const mk = item.first_due_month || item.start_month;
    if (mk) dates.push(mkToDate(mk));
  } else {
    const step = interval === 'quarterly' ? 3 : interval === 'yearly' ? 12 : 1;
    let mk = interval === 'monthly' ? startMk : (item.first_due_month || startMk);
    while (mk < startMk) mk = addMonths(mk, step);
    while (mk <= endMk) {
      dates.push(mkToDate(mk));
      mk = addMonths(mk, step);
    }
  }

  return dates.filter((d) =>
    d >= planStart && d < planEnd &&
    (!item.start_month || monthKey(d) >= item.start_month) &&
    (!item.end_month || monthKey(d) <= item.end_month)
  );
}

// ── Umsatz-Forecast (monatlich, 3 Kategorien) ─────────────────────────────
export function buildRevenueForecast({ contracts = [], orders = [], projects = [], invoices = [], horizonMonths = 12 }) {
  const recurring = buildRecurring(contracts);
  const backlog = buildOrderBacklog(orders, projects, invoices);
  const now = new Date();
  const months = [];
  for (let i = 0; i < horizonMonths; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push(monthKey(d));
  }
  const currentMonth = monthKey(now);

  // Auftragsbestand realistisch verteilen statt in einen Monat werfen:
  //  - Auftrag mit bekanntem, zukünftigem Erwartungsmonat → voll in diesem Monat
  //  - Auftrag ohne Termin → Restwert gleichmäßig über die nächsten `spread` Monate
  //    (offene Projekte werden über mehrere Monate abgearbeitet/abgerechnet)
  const spread = Math.min(6, horizonMonths);
  const backlogByMonth = {};
  months.forEach((mk) => { backlogByMonth[mk] = 0; });
  backlog.rows.forEach((o) => {
    if (o.expected_month && o.expected_month >= currentMonth && backlogByMonth[o.expected_month] !== undefined) {
      backlogByMonth[o.expected_month] += o.remaining;
    } else {
      const per = o.remaining / spread;
      for (let k = 0; k < spread; k++) {
        if (months[k] !== undefined) backlogByMonth[months[k]] += per;
      }
    }
  });

  const rows = months.map((mk) => {
    const recurringSecured = recurring.monthlyTotal;
    const backlogSecured = backlogByMonth[mk] || 0;
    return {
      month: mk,
      recurring: recurringSecured,
      backlog: backlogSecured,
      pipeline: 0,
      total: recurringSecured + backlogSecured,
    };
  });

  const totalRecurring = rows.reduce((s, r) => s + r.recurring, 0);
  const totalBacklog = rows.reduce((s, r) => s + r.backlog, 0);
  const total = rows.reduce((s, r) => s + r.total, 0);
  const rolling12 = rows.slice(0, 12).reduce((s, r) => s + r.total, 0);
  return { rows, totalRecurring, totalBacklog, total, rolling12 };
}

// ── 13-Wochen-Liquiditätsvorschau ─────────────────────────────────────────
function startOfWeek(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Montag = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function build13Week({ invoices = [], contracts = [], orders = [], projects = [], outflowItems = [], bankSnapshots = [], weeks = 13, setting = {} }) {
  const now = new Date();
  // Fixer Planbeginn: Woche 1 startet am gepflegten plan_start_date (Montag) —
  // nicht rollierend, damit Plan und Ist vergleichbar bleiben.
  // Fallback ohne gepflegten Planbeginn: Montag der aktuellen Woche.
  const planWeeks = num(setting.plan_weeks) || weeks;
  const hasPlanStart = !!setting.plan_start_date;
  const weekStart0 = hasPlanStart
    ? startOfWeek(new Date(setting.plan_start_date + 'T00:00:00'))
    : startOfWeek(now);
  const hearingDate = setting.reporting_hearing_date ? new Date(setting.reporting_hearing_date + 'T00:00:00') : null;

  // Anfangsbestand: jüngster Snapshot <= heute, sonst 0
  const sortedSnaps = [...bankSnapshots].sort((a, b) => new Date(b.balance_date) - new Date(a.balance_date));
  const openingSnap = sortedSnaps.find((s) => new Date(s.balance_date) <= now) || sortedSnaps[sortedSnaps.length - 1];
  const openingBalance = openingSnap ? num(openingSnap.amount) : 0;

  const defaultVat = num(setting.default_vat_rate) || 20;
  const recurring = buildRecurring(contracts);
  const recurringMonthlyGross = toGross(recurring.monthlyTotal, null, defaultVat);
  const backlog = buildOrderBacklog(orders, projects, invoices, defaultVat);
  const openRec = getOpenReceivables(invoices).map((i) => ({ ...i, _due: effectiveDueDate(i) }));

  const weekBoundaries = [];
  for (let w = 0; w < planWeeks; w++) {
    const s = new Date(weekStart0);
    s.setDate(s.getDate() + w * 7);
    const e = new Date(s);
    e.setDate(e.getDate() + 7);
    weekBoundaries.push({ start: s, end: e });
  }
  const currentMonth = monthKey(now);

  // ── Debitoren: Einbringlichkeitsannahme je Altersklasse ─────────────────
  // Überfällige Forderungen werden NICHT mehr vollständig in Woche 1 gebucht,
  // sondern mit einer Quote je Altersklasse über ein Zeitfenster verteilt.
  const collection = collectionAssumptions(setting);
  const receivablesByWeek = new Array(planWeeks).fill(0);
  const notAppliedByBucket = { '0_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
  let receivablesOpenTotal = 0;
  let receivablesApplied = 0;
  let receivablesOutsideHorizon = 0;

  openRec.forEach((i) => {
    const open = num(i._open); // Rechnungsbeträge sind bereits brutto
    receivablesOpenTotal += open;
    const due = i._due ? new Date(i._due + 'T00:00:00') : null;

    // Noch nicht fällige Forderungen: zum Fälligkeitstermin, voll angesetzt
    if (due && due >= weekStart0) {
      const idx = Math.floor((due - weekStart0) / (7 * 24 * 60 * 60 * 1000));
      if (idx < planWeeks) {
        receivablesByWeek[idx] += open;
        receivablesApplied += open;
      } else {
        receivablesOutsideHorizon += open;
      }
      return;
    }

    const days = agingDays(due, now);
    const bucket = agingBucket(days);
    const cfg = collection[bucket];
    const applied = open * (num(cfg.rate) / 100);
    const from = Math.max(1, num(cfg.from) || 1);
    const to = Math.max(from, num(cfg.to) || from);
    const per = applied / (to - from + 1);
    for (let w = from; w <= to; w++) {
      if (w - 1 < planWeeks) receivablesByWeek[w - 1] += per;
    }
    receivablesApplied += applied;
    notAppliedByBucket[bucket] += open - applied;
  });

  const receivablesNotApplied = Object.values(notAppliedByBucket).reduce((s, v) => s + v, 0);

  // ── Auftragsbestand: Kapazitätsdeckel + Zahlungsziel ────────────────────
  // Schritt 1: abgeleitete Fakturierung je Woche (brutto)
  const rawBillingByWeek = new Array(planWeeks).fill(0);
  let backlogUndatedGross = 0;
  let backlogDatedGross = 0;
  let backlogDatedOutside = 0;
  backlog.rows.forEach((o) => {
    const value = o.remaining_gross;
    if (o.expected_month && o.expected_month >= currentMonth) {
      backlogDatedGross += value;
      const wIdx = weekBoundaries.findIndex((wb) => monthKey(wb.start) === o.expected_month && wb.start.getDate() <= 7);
      if (wIdx >= 0) rawBillingByWeek[wIdx] += value;
      else backlogDatedOutside += value;
    } else {
      backlogUndatedGross += value;
    }
  });
  const undatedPerWeek = backlogUndatedGross / planWeeks;
  for (let w = 0; w < planWeeks; w++) rawBillingByWeek[w] += undatedPerWeek;

  // Schritt 2: Kapazitätsgrenze je Monat — Überhang rutscht in Folgewochen
  const monthlyCap = num(setting.max_monthly_billing_gross);
  const billingByWeek = new Array(planWeeks).fill(0);
  const usedByMonth = {};
  let carry = 0;
  for (let w = 0; w < planWeeks; w++) {
    const mk = monthKey(weekBoundaries[w].start);
    const want = rawBillingByWeek[w] + carry;
    const available = monthlyCap > 0 ? Math.max(0, monthlyCap - (usedByMonth[mk] || 0)) : Infinity;
    const take = Math.min(want, available);
    billingByWeek[w] = take;
    usedByMonth[mk] = (usedByMonth[mk] || 0) + take;
    carry = want - take;
  }
  const backlogNotInHorizon = carry + backlogDatedOutside;

  // Schritt 3: Zeitversatz zwischen Leistung/Rechnung und Zahlungseingang
  const cashShiftWeeks = setting.billing_to_cash_weeks === undefined || setting.billing_to_cash_weeks === null || setting.billing_to_cash_weeks === ''
    ? 4
    : num(setting.billing_to_cash_weeks);
  const backlogCashByWeek = new Array(planWeeks).fill(0);
  let backlogCashAfterHorizon = 0;
  billingByWeek.forEach((v, w) => {
    const target = w + cashShiftWeeks;
    if (target < planWeeks) backlogCashByWeek[target] += v;
    else backlogCashAfterHorizon += v;
  });

  // Auszahlungen: jeder aktive Posten wird auf seine konkreten Fälligkeitstermine gelegt.
  // Szenarioposten (scenario_only) bleiben aus dem Basisplan draußen.
  const planEnd = weekBoundaries[weekBoundaries.length - 1].end;
  const baseOutflowItems = outflowItems.filter((o) => o.is_active !== false && !o.scenario_only);
  const scenarioItems = outflowItems.filter((o) => o.is_active !== false && o.scenario_only);
  const outflowEvents = [];
  baseOutflowItems.forEach((o) => {
    outflowDueDates(o, weekStart0, planEnd).forEach((d) => outflowEvents.push({ date: d, item: o }));
  });

  let balance = openingBalance;
  const rows = weekBoundaries.map((wb, idx) => {
    // Einzahlungen aus Debitoren: nach Einbringlichkeitsannahme verteilt
    const recIn = receivablesByWeek[idx];

    // Recurring (Retainer + Hosting): monatlich brutto zum Monatsersten
    let recurringIn = 0;
    for (let d = new Date(wb.start); d < wb.end; d.setDate(d.getDate() + 1)) {
      if (d.getDate() === 1) { recurringIn = recurringMonthlyGross; break; }
    }

    // Auftragsbestand: gedeckelte Fakturierung, um das Zahlungsziel verschoben
    const backlogIn = backlogCashByWeek[idx];

    const inflow = recIn + recurringIn + backlogIn;

    // Auszahlungen: alle Posten, deren Fälligkeitstermin in diese Woche fällt
    const weekEvents = outflowEvents.filter((ev) => ev.date >= wb.start && ev.date < wb.end);
    const outflow = weekEvents.reduce((s, ev) => s + num(ev.item.amount), 0);
    const byCat = new Map();
    weekEvents.forEach((ev) => {
      const cat = ev.item.category || 'sonstige_auszahlung';
      const cur = byCat.get(cat) || { category: cat, total: 0, items: [] };
      cur.total += num(ev.item.amount);
      cur.items.push({ id: ev.item.id, label: ev.item.label, amount: num(ev.item.amount), due_date: localISO(ev.date) });
      byCat.set(cat, cur);
    });

    const opening = balance;
    balance = opening + inflow - outflow;
    return {
      index: idx,
      week_start: localISO(wb.start),
      week_end: localISO(new Date(wb.end.getTime() - 1)),
      is_hearing_week: !!(hearingDate && hearingDate >= wb.start && hearingDate < wb.end),
      opening,
      receivables_in: recIn,
      recurring_in: recurringIn,
      backlog_in: backlogIn,
      inflow,
      outflow,
      outflow_by_category: Array.from(byCat.values()).sort((a, b) => b.total - a.total),
      closing: balance,
      negative: balance < 0,
    };
  });

  const hearingWeekIndex = rows.findIndex((r) => r.is_hearing_week);

  return {
    rows,
    openingBalance,
    openingSnap,
    // Szenarioposten — Höhe nicht vom Unternehmen bestimmt, nicht im Basisplan
    scenarioItems: scenarioItems.map((o) => ({
      id: o.id,
      category: o.category,
      label: o.label,
      amount: num(o.amount),
      interval: o.interval || 'monthly',
      derivation: o.derivation || '',
    })),
    // Plan-Metadaten — fixer Planbeginn, Berichtstagsatzung
    plan: {
      startDate: localISO(weekStart0),
      planStartMissing: !hasPlanStart,
      weeks: planWeeks,
      hearingDate: setting.reporting_hearing_date || null,
      hearingWeekIndex,
    },
    // Metadaten zur Hochrechnung — für Transparenz in der UI (alle Werte brutto)
    projection: {
      backlogTotal: backlog.totalGross,
      backlogUndated: backlogUndatedGross,
      backlogDated: backlogDatedGross,
      undatedPerWeek,
      recurringMonthly: recurringMonthlyGross,
      monthlyCap,
      cashShiftWeeks,
      backlogNotInHorizon,
      backlogCashAfterHorizon,
      estimatedAssigned: backlog.estimatedAssigned,
      estimatedCount: backlog.estimatedCount,
    },
    receivablesAssumption: {
      collection,
      openTotal: receivablesOpenTotal,
      applied: receivablesApplied,
      notApplied: receivablesNotApplied,
      notAppliedByBucket,
      outsideHorizon: receivablesOutsideHorizon,
    },
  };
}

// ── Deckungsgrundlage (operativer Überschuss, monatlich + kumuliert) ──────
export function buildCoverage({ forecast, outflowItems = [], horizonMonths = 12 }) {
  let cumulative = 0;
  const rows = forecast.rows.slice(0, horizonMonths).map((r) => {
    const costs = monthlyOutflowTotal(outflowItems, r.month);
    const surplus = r.total - costs;
    cumulative += surplus;
    return {
      month: r.month,
      revenue: r.total,
      costs,
      surplus,
      cumulative,
    };
  });
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCosts = rows.reduce((s, r) => s + r.costs, 0);
  const totalSurplus = totalRevenue - totalCosts;
  return { rows, totalRevenue, totalCosts, totalSurplus };
}

// ── Cockpit-Kennzahlen ────────────────────────────────────────────────────
export function buildCockpit(params) {
  const { invoices = [], contracts = [], orders = [], projects = [], timeEntries = [], outflowItems = [], bankSnapshots = [], projectSnapshots = [], setting = {} } = params;
  const rate = num(setting.wip_blended_hourly_rate);
  const horizon = num(setting.planning_horizon_months) || 12;

  const aging = buildAging(invoices, setting.insolvency_opening_date);
  const recurring = buildRecurring(contracts);
  const backlog = buildOrderBacklog(orders, projects, invoices);
  const wip = buildWip(timeEntries, projects, rate, projectSnapshots);
  const week13 = build13Week({ invoices, contracts, orders, projects, outflowItems, bankSnapshots, setting });
  const monthlyFixed = monthlyOutflowTotal(outflowItems, monthKey(new Date()));
  const coverageRatio = monthlyFixed > 0 ? (recurring.monthlyTotal / monthlyFixed) * 100 : 0;

  const liquidityToday = week13.openingBalance;
  const liquidity4w = week13.rows[3]?.closing ?? liquidityToday;
  const liquidity13w = week13.rows[12]?.closing ?? liquidityToday;

  return {
    liquidityToday,
    liquidity4w,
    liquidity13w,
    recurringAnnual: recurring.annualTotal,
    recurringMonthly: recurring.monthlyTotal,
    monthlyFixed,
    coverageRatio,
    backlogTotal: backlog.total,
    receivablesTotal: aging.total,
    receivablesOverdue: aging.overdue,
    wipValue: wip.totalValue,
    wipHours: wip.totalHours,
    horizon,
    hasRate: rate > 0,
    hasBank: !!week13.openingSnap,
  };
}