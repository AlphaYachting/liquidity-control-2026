/**
 * awork Readiness Utility — Advisory Only
 * NEVER automatically changes invoice_readiness_status.
 * All signals are suggestions for PM review.
 */

export function calculateAworkStatusForBillingBlock(billingBlock, aworkTasks) {
  const total = aworkTasks.length;

  if (total === 0) {
    return {
      awork_progress_percent: 0,
      awork_tasks_total: 0,
      awork_tasks_done: 0,
      awork_tasks_open: 0,
      awork_tasks_blocked: 0,
      awork_responsible_person: '',
      awork_last_activity_at: null,
      awork_readiness_signal: 'unknown',
      awork_signal_reason: 'Keine awork-Aufgaben verknüpft',
      awork_adjusted_probability: billingBlock.probability_percent ?? 90
    };
  }

  const done = aworkTasks.filter(t => t.task_status_type === 'done' || t.is_done).length;
  const blocked = aworkTasks.filter(t => t.task_status_type === 'blocked' || t.is_blocked).length;
  const open = aworkTasks.filter(t =>
    !t.is_done && t.task_status_type !== 'done' && t.task_status_type !== 'blocked'
  ).length;

  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  // Last activity
  const validDates = aworkTasks
    .map(t => t.last_activity_at)
    .filter(Boolean)
    .map(d => new Date(d))
    .filter(d => !isNaN(d));
  const lastActivity = validDates.length > 0
    ? new Date(Math.max(...validDates.map(d => d.getTime())))
    : null;

  // Responsible person (most common assignee or first)
  const nameCounts = {};
  for (const t of aworkTasks) {
    if (t.assignee_name) nameCounts[t.assignee_name] = (nameCounts[t.assignee_name] || 0) + 1;
  }
  const responsiblePerson = Object.entries(nameCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

  // Staleness check
  const staleDays = lastActivity
    ? Math.floor((Date.now() - lastActivity.getTime()) / 86400000)
    : 999;

  const currentProbability = billingBlock.probability_percent ?? 90;

  // Signal calculation (priority order)
  let signal, reason, adjustedProbability;

  if (blocked > 0) {
    signal = 'blocked';
    reason = `${blocked} Aufgabe(n) blockiert — bitte klären`;
    adjustedProbability = Math.min(currentProbability, 20);
  } else if (staleDays > 30 && progress < 90) {
    signal = 'review_needed';
    reason = `Seit mehr als 30 Tagen keine Aktivität (${staleDays} Tage)`;
    adjustedProbability = Math.min(currentProbability, 60);
  } else if (progress === 100) {
    signal = 'ready_candidate';
    reason = `Alle ${total} Aufgaben abgeschlossen`;
    adjustedProbability = 95;
  } else if (progress >= 90) {
    signal = 'likely_ready';
    reason = `${done}/${total} Aufgaben abgeschlossen, keine Blocker`;
    adjustedProbability = Math.max(currentProbability, 80);
  } else if (progress >= 60) {
    signal = 'review_needed';
    reason = `${done}/${total} Aufgaben erledigt — bitte prüfen`;
    adjustedProbability = Math.min(currentProbability, 60);
  } else {
    signal = 'not_ready';
    reason = `Aufgabenfortschritt zu niedrig (${progress}%)`;
    adjustedProbability = Math.min(currentProbability, 40);
  }

  return {
    awork_progress_percent: progress,
    awork_tasks_total: total,
    awork_tasks_done: done,
    awork_tasks_open: open,
    awork_tasks_blocked: blocked,
    awork_responsible_person: responsiblePerson,
    awork_last_activity_at: lastActivity?.toISOString() || null,
    awork_readiness_signal: signal,
    awork_signal_reason: reason,
    awork_adjusted_probability: adjustedProbability
  };
}

export const READINESS_SIGNAL_CONFIG = {
  unknown:         { label: 'Unbekannt',       color: 'bg-gray-100 text-gray-500',       icon: '?' },
  not_ready:       { label: 'Nicht bereit',     color: 'bg-red-100 text-red-700',         icon: '✗' },
  review_needed:   { label: 'Prüfen',           color: 'bg-amber-100 text-amber-700',     icon: '!' },
  likely_ready:    { label: 'Wahrsch. bereit',  color: 'bg-blue-100 text-blue-700',       icon: '~' },
  ready_candidate: { label: 'Bereit (Vorschlag)', color: 'bg-emerald-100 text-emerald-700', icon: '✓' },
  blocked:         { label: 'Blockiert',        color: 'bg-red-200 text-red-800',         icon: '⊘' },
};

export function getTasksForBillingBlock(billingBlock, allTaskSnapshots) {
  if (!billingBlock.awork_mapping_type || billingBlock.awork_mapping_type === 'none') return [];

  if (billingBlock.awork_mapping_type === 'tasks') {
    let taskIds = [];
    try { taskIds = JSON.parse(billingBlock.awork_task_ids || '[]'); } catch { taskIds = []; }
    return allTaskSnapshots.filter(t => taskIds.includes(t.awork_task_id));
  }

  if (billingBlock.awork_mapping_type === 'task_list') {
    return allTaskSnapshots.filter(t => t.task_list_id === billingBlock.awork_task_list_id);
  }

  return [];
}