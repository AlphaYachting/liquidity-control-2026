import React from 'react';
import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function KpiCard({ title, value, subtitle, icon: Icon, trend, trendLabel, variant = 'default', className = '', compact = false }) {
  const variantStyles = {
    default: 'border-border',
    success: 'border-l-4 border-l-status-done',
    warning: 'border-l-4 border-l-status-attention',
    danger: 'border-l-4 border-l-status-critical',
    info: 'border-l-4 border-l-status-neutral',
  };

  return (
    <Card className={`${compact ? 'p-3' : 'p-5'} ${variantStyles[variant]} ${className}`}>
      <div className="flex items-start justify-between">
        <div className={`${compact ? 'space-y-0.5' : 'space-y-1'} min-w-0 flex-1`}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider leading-tight" title={typeof title === 'string' ? title : undefined}>{title}</p>
          <p className={`${compact ? 'text-lg' : 'text-2xl'} font-bold tracking-tight`} title={typeof value === 'string' ? value : undefined}>{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground leading-tight">{subtitle}</p>}
          {trendLabel && (
            <div className="flex items-center gap-1 mt-1">
              {trend === 'up' && <TrendingUp className="w-3 h-3 text-status-done" />}
              {trend === 'down' && <TrendingDown className="w-3 h-3 text-status-critical" />}
              {(!trend || trend === 'neutral') && <Minus className="w-3 h-3 text-muted-foreground" />}
              <span className={`text-xs font-medium ${
                trend === 'up' ? 'text-status-done' : trend === 'down' ? 'text-status-critical' : 'text-muted-foreground'
              }`}>{trendLabel}</span>
            </div>
          )}
        </div>
        {Icon && (
          <div className={`${compact ? 'p-1.5' : 'p-2.5'} rounded-xl bg-muted flex-shrink-0 ml-2`}>
            <Icon className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-muted-foreground`} />
          </div>
        )}
      </div>
    </Card>
  );
}