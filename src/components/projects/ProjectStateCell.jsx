import React from 'react';
import Ampelpunkt from '@/components/sprint/Ampelpunkt';

// Zelle "Projektstand" — Ampel + Frist, offene Aufgaben, Zeitbudget-Warnung
export default function ProjectStateCell({ state }) {
  if (!state || state.status === 'none') {
    return <span className="text-xs text-muted-foreground">nicht verknüpft</span>;
  }

  const dueClass = state.stale
    ? 'text-muted-foreground'
    : state.status === 'critical'
      ? 'text-status-critical font-semibold'
      : state.status === 'attention'
        ? 'text-status-attention font-semibold'
        : 'text-muted-foreground';

  return (
    <div className="space-y-0.5" style={{ maxWidth: '190px' }}>
      <div className="flex items-center gap-1.5" title={state.staleTitle || undefined}>
        <Ampelpunkt status={state.status} />
        <span className={`text-xs truncate ${dueClass}`}>{state.dueLabel}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {state.tasksText}
        {state.blocked > 0 && <span className="text-status-critical"> · {state.blocked} blockiert</span>}
      </p>
      {state.budgetPct !== null && (
        <p className={`text-xs ${state.budgetPct >= 100 ? 'text-status-critical' : 'text-status-attention'}`}>
          Zeitbudget {state.budgetPct} %
        </p>
      )}
    </div>
  );
}