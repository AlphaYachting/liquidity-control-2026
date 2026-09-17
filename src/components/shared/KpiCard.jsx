import React from 'react';
import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TON_STREIFEN } from '@/lib/designTon';

// Einzelkachel im Stil der Kennzahlleiste — Streifen nur bei warning/danger.
const STREIFEN = {
  default: '',
  success: '',
  info: '',
  warning: TON_STREIFEN.attention,
  danger: TON_STREIFEN.critical,
};

export default function KpiCard({ title, value, subtitle, icon: Icon, trend, trendLabel, variant = 'default', className = '', compact = false }) {
  return (
    <Card className={cn(compact ? 'p-3' : 'p-4', STREIFEN[variant], className)}>
      <div className="flex items-start justify-between">
        <div className={cn(compact ? 'space-y-0.5' : 'space-y-1', 'min-w-0 flex-1')}>
          <p className="text-label uppercase text-muted-foreground truncate" title={typeof title === 'string' ? title : undefined}>{title}</p>
          <p className={cn(compact ? 'text-value' : 'text-kpi', 'tabular-nums')} title={typeof value === 'string' ? value : undefined}>{value}</p>
          {subtitle && (
            <p className={cn('text-meta', variant === 'success' ? 'text-status-done-text' : 'text-muted-foreground')}>{subtitle}</p>
          )}
          {trendLabel && (
            <div className="flex items-center gap-1 mt-1">
              {trend === 'up' && <TrendingUp className="w-3 h-3 text-status-done" />}
              {trend === 'down' && <TrendingDown className="w-3 h-3 text-status-critical" />}
              {(!trend || trend === 'neutral') && <Minus className="w-3 h-3 text-muted-foreground" />}
              <span className={cn('text-meta font-medium',
                trend === 'up' ? 'text-status-done-text' : trend === 'down' ? 'text-status-critical' : 'text-muted-foreground')}>
                {trendLabel}
              </span>
            </div>
          )}
        </div>
        {Icon && (
          <div className="p-2 rounded-lg bg-muted flex-shrink-0 ml-2">
            <Icon className={cn(compact ? 'w-4 h-4' : 'w-5 h-5', 'text-muted-foreground')} />
          </div>
        )}
      </div>
    </Card>
  );
}