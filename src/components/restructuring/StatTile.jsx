import React from 'react';
import { Card } from '@/components/ui/card';

export default function StatTile({ label, value, sub, tone = 'default', hint }) {
  const toneClass = {
    default: 'text-foreground',
    positive: 'text-emerald-600',
    negative: 'text-red-600',
    warning: 'text-amber-600',
  }[tone] || 'text-foreground';
  return (
    <Card className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold tabular-nums mt-1 ${toneClass}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      {hint && <p className="text-[10px] text-amber-600 mt-1">{hint}</p>}
    </Card>
  );
}