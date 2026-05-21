import React from 'react';
import { READINESS_SIGNAL_CONFIG } from '@/lib/aworkReadinessUtils';

export default function AworkSignalBadge({ signal, reason, showReason = false }) {
  const cfg = READINESS_SIGNAL_CONFIG[signal] || READINESS_SIGNAL_CONFIG.unknown;
  return (
    <div className="inline-flex flex-col gap-0.5">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
        <span>{cfg.icon}</span>
        {cfg.label}
      </span>
      {showReason && reason && (
        <span className="text-xs text-muted-foreground">{reason}</span>
      )}
    </div>
  );
}