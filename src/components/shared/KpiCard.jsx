import React from 'react';
import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function KpiCard({ title, value, subtitle, icon: Icon, trend, trendLabel, variant = 'default', className = '', compact = false }) {
  const variantStyles = {
    default: 'border-border',
    success: 'border-l-4 border-l-emerald-500',
    warning: 'border-l-4 border-l-amber-500',
    danger: 'border-l-4 border-l-red-500',
    info: 'border-l-4 border-l-blue-500',
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
              {trend === 'up' && <TrendingUp className="w-3 h-3 text-emerald-500" />}
              {trend === 'down' && <TrendingDown className="w-3 h-3 text-red-500" />}
              {(!trend || trend === 'neutral') && <Minus className="w-3 h-3 text-muted-foreground" />}
              <span className={`text-xs font-medium ${
                trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-600' : 'text-muted-foreground'
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