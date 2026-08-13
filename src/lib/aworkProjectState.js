import { fmtDate } from '@/components/sprint/sprintConfig';

// Projektstand aus dem awork-Snapshot — Ampellogik identisch zu ampelFor() im Sprint-Modul.
// Ohne Snapshot gibt es bewusst KEINEN Status (nicht verknüpft darf nicht wie "im Plan" aussehen).

export const PROJECT_STATE_RANK = { critical: 0, attention: 1, plan: 2, none: 3 };

// Offene Aufgaben je awork-Projekt verdichten: blockierte, früheste Frist, überfällige
export function aggregateOpenTasks(openTasks) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const map = {};
  openTasks.forEach(t => {
    const pid = t.awork_project_id;
    if (!pid) return;
    if (!map[pid]) map[pid] = { blocked: 0, earliestDue: null, overdue: 0 };
    const agg = map[pid];
    if (t.is_blocked === true || t.task_status_type === 'blocked') agg.blocked += 1;
    if (t.due_date) {
      if (!agg.earliestDue || t.due_date < agg.earliestDue) agg.earliestDue = t.due_date;
      if (t.due_date < todayIso) agg.overdue += 1;
    }
  });
  return map;
}

export function computeProjectState(snapshot, taskAgg = null) {
  if (!snapshot) return { status: 'none', dueLabel: null, dueDate: null, tasksText: null, budgetPct: null, blocked: 0, stale: false, staleTitle: null };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Maßgeblich ist die nächste echte Frist: früheste offene Aufgabenfrist vor dem Projektendtermin
  let effectiveDue = snapshot.due_date || null;
  const taskDue = taskAgg?.earliestDue || null;
  if (taskDue && (!effectiveDue || taskDue < effectiveDue)) effectiveDue = taskDue;

  let status = 'plan';
  let dueLabel = 'kein Termin';
  if (effectiveDue) {
    const rest = Math.round((new Date(effectiveDue) - today) / 86400000);
    if (rest < 0) {
      status = 'critical';
      dueLabel = `überfällig seit ${Math.abs(rest)} Tagen`;
    } else if (rest <= 7) {
      status = 'attention';
      dueLabel = `fällig in ${rest} Tagen`;
    } else {
      status = 'plan';
      dueLabel = `fällig am ${fmtDate(effectiveDue)}`;
    }
  }

  const total = Number(snapshot.tasks_count) || 0;
  const done = Number(snapshot.tasks_done_count) || 0;
  const tasksText = total > 0 ? `${Math.max(0, total - done)} von ${total} offen` : 'keine awork-Daten';

  const budget = Number(snapshot.time_budget_minutes) || 0;
  const tracked = Number(snapshot.tracked_duration_minutes) || 0;
  const pct = budget > 0 ? (tracked / budget) * 100 : 0;
  const budgetPct = pct > 70 ? Math.round(pct) : null;

  let stale = false;
  let staleTitle = null;
  if (snapshot.last_synced_at) {
    const age = Date.now() - new Date(snapshot.last_synced_at).getTime();
    if (age > 24 * 3600 * 1000) {
      stale = true;
      staleTitle = `Daten vom ${fmtDate(snapshot.last_synced_at)}, nicht aktuell`;
    }
  }

  return {
    status,
    dueLabel,
    dueDate: effectiveDue,
    tasksText,
    budgetPct,
    blocked: taskAgg?.blocked || 0,
    stale,
    staleTitle,
  };
}