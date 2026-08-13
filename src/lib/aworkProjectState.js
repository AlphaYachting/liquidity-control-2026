import { fmtDate } from '@/components/sprint/sprintConfig';

// Projektstand aus dem awork-Snapshot — Ampellogik identisch zu ampelFor() im Sprint-Modul.
// Ohne Snapshot gibt es bewusst KEINEN Status (nicht verknüpft darf nicht wie "im Plan" aussehen).

export const PROJECT_STATE_RANK = { critical: 0, attention: 1, plan: 2, none: 3 };

export function computeProjectState(snapshot) {
  if (!snapshot) return { status: 'none', dueLabel: null, dueDate: null, tasksText: null, budgetPct: null, stale: false, staleTitle: null };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let status = 'plan';
  let dueLabel = 'kein Termin';
  if (snapshot.due_date) {
    const due = new Date(snapshot.due_date);
    const rest = Math.round((due - today) / 86400000);
    if (rest < 0) {
      status = 'critical';
      dueLabel = `überfällig seit ${Math.abs(rest)} Tagen`;
    } else if (rest <= 7) {
      status = 'attention';
      dueLabel = `fällig in ${rest} Tagen`;
    } else {
      status = 'plan';
      dueLabel = `fällig am ${fmtDate(snapshot.due_date)}`;
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

  return { status, dueLabel, dueDate: snapshot.due_date || null, tasksText, budgetPct, stale, staleTitle };
}