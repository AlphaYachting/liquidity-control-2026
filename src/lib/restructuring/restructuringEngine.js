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

export function buildOrderBacklog(orders = [], projects = [], invoices = []) {
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

  // Fallback-Kundenzuordnung nur einmal je Kunde verteilen (nicht pro Auftrag doppelt abziehen)
  const customerBudgetUsed = new Set();

  const rows = deduped
    .map((o) => {
      const total = num(o.total_net_amount);
      let invoiced = invByOrder.get(o.id) || 0;
      // Fallback: kein per-Auftrag-Wert vorhanden → Kundenrechnungen heranziehen (gedeckelt auf Auftragssumme)
      if (invoiced <= 0.01) {
        const ck = normName(o.customer);
        if (ck && !customerBudgetUsed.has(ck)) {
          const custInvoiced = Math.max(0, invByCustomer.get(ck) || 0);
          invoiced = Math.min(total, custInvoiced);
          customerBudgetUsed.add(ck);
        }
      }
      const remaining = Math.max(0, total - invoiced);
      const proj = o.project_id ? projById.get(o.project_id) : null;
      const expDate = proj?.expected_invoice_date || null;
      const expMonth = proj?.expected_invoice_month || (expDate ? monthKey(expDate) : null);
      return {
        id: o.id,
        order_number: o.order_number || '—',
        customer: o.customer || '—',
        project_name: o.project_name || '—',
        total,
        invoiced,
        remaining,
        expected_month: expMonth,
        expected_date: expDate,
      };
    })
    .filter((r) => r.remaining > 0.01);
  const total = rows.reduce((s, r) => s + r.remaining, 0);
  return { rows: rows.sort((a, b) => b.remaining - a.remaining), total };
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

export function build13Week({ invoices = [], contracts = [], orders = [], projects = [], outflowItems = [], bankSnapshots = [], weeks = 13 }) {
  const now = new Date();
  const weekStart0 = startOfWeek(now);

  // Anfangsbestand: jüngster Snapshot <= heute, sonst 0
  const sortedSnaps = [...bankSnapshots].sort((a, b) => new Date(b.balance_date) - new Date(a.balance_date));
  const openingSnap = sortedSnaps.find((s) => new Date(s.balance_date) <= now) || sortedSnaps[sortedSnaps.length - 1];
  const openingBalance = openingSnap ? num(openingSnap.amount) : 0;

  const recurring = buildRecurring(contracts);
  const backlog = buildOrderBacklog(orders, projects, invoices);
  const openRec = getOpenReceivables(invoices).map((i) => ({ ...i, _due: effectiveDueDate(i) }));

  // Auftragsbestand als wöchentliche Hochrechnung über den Vorschauzeitraum:
  // Der offene Auftragsbestand wird abgearbeitet und über die Wochen abgerechnet.
  //  - Auftrag mit bekanntem, zukünftigem Erwartungsmonat → in der Woche mit dem 1. dieses Monats
  //  - Auftrag ohne Termin → Restwert gleichmäßig auf alle 13 Wochen verteilt (lineare Abarbeitung)
  const currentMonth = monthKey(now);
  const backlogDatedByMonth = {};
  let backlogUndated = 0;
  backlog.rows.forEach((o) => {
    if (o.expected_month && o.expected_month >= currentMonth) {
      backlogDatedByMonth[o.expected_month] = (backlogDatedByMonth[o.expected_month] || 0) + o.remaining;
    } else {
      backlogUndated += o.remaining;
    }
  });
  const undatedPerWeek = backlogUndated / weeks;

  const weekBoundaries = [];
  for (let w = 0; w < weeks; w++) {
    const s = new Date(weekStart0);
    s.setDate(s.getDate() + w * 7);
    const e = new Date(s);
    e.setDate(e.getDate() + 7);
    weekBoundaries.push({ start: s, end: e });
  }

  let balance = openingBalance;
  const rows = weekBoundaries.map((wb, idx) => {
    // Einzahlungen: fällige Debitoren nach Fälligkeitsdatum
    let recIn = openRec
      .filter((i) => i._due && new Date(i._due) >= (idx === 0 ? new Date(0) : wb.start) && new Date(i._due) < wb.end)
      .reduce((s, i) => s + i._open, 0);

    // Recurring (Retainer + Hosting): monatlich → auf erste Woche des Monats legen (Vereinfachung: gleichmäßig als Monatswert in Woche, die den 1. enthält)
    let recurringIn = 0;
    const containsFirst = [];
    for (let d = new Date(wb.start); d < wb.end; d.setDate(d.getDate() + 1)) {
      if (d.getDate() === 1) containsFirst.push(1);
    }
    if (containsFirst.length > 0) recurringIn = recurring.monthlyTotal;

    // Hochrechnung Auftragsbestand:
    //  a) undatierte Aufträge → jede Woche ein gleichmäßiger Anteil (lineare Abarbeitung)
    //  b) datierte Aufträge → voll in der Woche, die den 1. des Erwartungsmonats enthält
    let backlogIn = undatedPerWeek;
    if (containsFirst.length > 0) {
      const mk = monthKey(wb.start);
      backlogIn += backlogDatedByMonth[mk] || 0;
    }

    const inflow = recIn + recurringIn + backlogIn;

    // Auszahlungen: aktive Outflows, monatlich → in Woche die den due_day enthält (Vereinfachung: erste Woche des Monats)
    let outflow = 0;
    if (containsFirst.length > 0) {
      const mk = monthKey(wb.start);
      outflow = monthlyOutflowTotal(outflowItems, mk);
    }

    const opening = balance;
    balance = opening + inflow - outflow;
    return {
      index: idx,
      week_start: wb.start.toISOString().slice(0, 10),
      week_end: new Date(wb.end.getTime() - 1).toISOString().slice(0, 10),
      opening,
      receivables_in: recIn,
      recurring_in: recurringIn,
      backlog_in: backlogIn,
      inflow,
      outflow,
      closing: balance,
      negative: balance < 0,
    };
  });

  return {
    rows,
    openingBalance,
    openingSnap,
    // Metadaten zur Hochrechnung — für Transparenz in der UI
    projection: {
      backlogTotal: backlog.total,
      backlogUndated,
      backlogDated: backlog.total - backlogUndated,
      undatedPerWeek,
      recurringMonthly: recurring.monthlyTotal,
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
  const week13 = build13Week({ invoices, contracts, orders, projects, outflowItems, bankSnapshots });
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