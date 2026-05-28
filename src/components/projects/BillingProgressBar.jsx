import React from 'react';

/**
 * Compact billing progress bar showing billing% vs performance%
 */
export default function BillingProgressBar({ billingPct, performancePct, size = 'sm' }) {
  const h = size === 'sm' ? 'h-1.5' : 'h-2';
  const gap = performancePct > 0 ? (performancePct - billingPct) : 0;

  return (
    <div className="space-y-0.5">
      <div className={`relative w-full ${h} bg-muted rounded-full overflow-hidden`}>
        {/* Performance reference line */}
        {performancePct > 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 z-10 opacity-70"
            style={{ left: `${Math.min(performancePct, 100)}%` }}
          />
        )}
        {/* Billing fill */}
        <div
          className={`h-full rounded-full transition-all ${
            billingPct >= 100 ? 'bg-emerald-500' :
            billingPct >= 70 ? 'bg-blue-500' :
            billingPct >= 30 ? 'bg-primary/70' :
            'bg-muted-foreground/40'
          }`}
          style={{ width: `${Math.min(billingPct, 100)}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className="text-blue-700 font-medium">{Math.round(billingPct)}% verr.</span>
        {gap > 5 && <span className="text-amber-600">⚠ +{Math.round(gap)}%</span>}
      </div>
    </div>
  );
}