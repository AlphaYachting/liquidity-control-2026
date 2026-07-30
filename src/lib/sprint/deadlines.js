// Fristenrechnung Sprint-Modul.
// Arbeitstage = Montag bis Freitag, keine Feiertagslogik in Stufe 1.
// Alle Kennzahlen kommen aus der Setting-Entität, nie fest aus dem Code.

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s) => new Date(`${s}T00:00:00`);

export const isWeekend = (isoDate) => [0, 6].includes(parse(isoDate).getDay());

// Verschiebt ein Wochenenddatum auf den davor liegenden Freitag
export function pullBackToFriday(isoDate) {
  const d = parse(isoDate);
  while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() - 1);
  return iso(d);
}

export function addWorkdays(isoDate, count) {
  const d = parse(isoDate);
  let left = count;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (![0, 6].includes(d.getDay())) left -= 1;
  }
  return iso(d);
}

export function subtractWorkdays(isoDate, count) {
  const d = parse(isoDate);
  let left = count;
  while (left > 0) {
    d.setDate(d.getDate() - 1);
    if (![0, 6].includes(d.getDay())) left -= 1;
  }
  return iso(d);
}

export function addCalendarDays(isoDate, count) {
  const d = parse(isoDate);
  d.setDate(d.getDate() + count);
  return iso(d);
}

export function workdaysBetween(fromIso, toIso) {
  const from = parse(fromIso), to = parse(toIso);
  if (to <= from) return 0;
  let n = 0;
  const d = new Date(from);
  while (d < to) {
    d.setDate(d.getDate() + 1);
    if (![0, 6].includes(d.getDay())) n += 1;
  }
  return n;
}

// Kennzahlen je Sprintgröße aus den Einstellungen ziehen
export function deadlineParams(settings, size) {
  const get = (key, fallback) => {
    const s = settings.find((x) => x.key === key);
    return s ? Number(s.value) : fallback;
  };
  return {
    window: get(`feedback_window_${size}`, size === 'S' ? 3 : 5),
    prewarning: get(`prewarning_${size}`, size === 'S' ? 2 : size === 'M' ? 3 : 5),
    buffer: get(`buffer_${size}`, size === 'S' ? 3 : size === 'M' ? 7 : 14),
  };
}

// Obergrenze für den Freeze des letzten Milestones
export function finalFreezeCap(deliveryDate, buffer) {
  return pullBackToFriday(addCalendarDays(deliveryDate, -buffer));
}

/**
 * Plantermine rückwärts vom Liefertermin — beim Anlegen des Sprints, nicht beim Ereignis.
 * Ergebnis: { deliverable, reason, suggestedDelivery, plan: [{ planned_handover, planned_freeze, pulled_forward }] }
 */
export function planSprintDeadlines({ startDate, deliveryDate, size, milestoneCount, settings = [] }) {
  const { window, buffer } = deadlineParams(settings, size);
  const freezeCap = finalFreezeCap(deliveryDate, buffer);
  const lastHandover = subtractWorkdays(freezeCap, window);

  if (workdaysBetween(startDate, lastHandover) < milestoneCount) {
    const needed = addWorkdays(startDate, milestoneCount);
    return {
      deliverable: false,
      reason: 'Liefertermin zu knapp für diese Sprintgröße.',
      suggestedDelivery: pullBackToFriday(addCalendarDays(addWorkdays(needed, window), buffer)),
      plan: [],
    };
  }

  const span = workdaysBetween(startDate, lastHandover);
  const plan = [];
  for (let i = 1; i <= milestoneCount; i++) {
    const handover = addWorkdays(startDate, Math.max(1, Math.round((span * i) / milestoneCount)));
    let freeze = addWorkdays(handover, window);
    let pulled = false;
    if (i === milestoneCount && freeze > freezeCap) {
      freeze = freezeCap;
      pulled = true;
    }
    plan.push({ planned_handover: handover, planned_freeze: freeze, pulled_forward: pulled });
  }
  return { deliverable: true, reason: null, suggestedDelivery: null, plan };
}

/**
 * Tatsächliche Fristen beim Wechsel nach "kundenfeedback".
 * Vorwarnung liegt nie am Übergabetag selbst — sonst wirkt sie drängend und entwertet den Mechanismus.
 */
export function computeFeedbackDeadline({ handoverDate, size, settings = [], isFinal, deliveryDate }) {
  const { window, prewarning, buffer } = deadlineParams(settings, size);
  let deadline = addWorkdays(handoverDate, window);
  let pulled = false;

  if (isFinal && deliveryDate) {
    const cap = finalFreezeCap(deliveryDate, buffer);
    if (deadline > cap) { deadline = cap; pulled = true; }
    if (cap <= handoverDate) {
      return { error: 'Liefertermin zu knapp für diese Sprintgröße', handover_date: handoverDate };
    }
  }

  let prewarn = subtractWorkdays(deadline, prewarning);
  const suppressPrewarning = prewarn <= handoverDate;
  if (suppressPrewarning) prewarn = addWorkdays(handoverDate, 1);
  if (prewarn >= deadline) prewarn = null;

  return {
    error: null,
    handover_date: handoverDate,
    feedback_deadline: deadline,
    prewarning_date: prewarn,
    deadline_pulled_forward: pulled,
    suppress_prewarning_mail: suppressPrewarning,
  };
}