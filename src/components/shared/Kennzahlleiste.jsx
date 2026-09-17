import React from 'react';
import { cn } from '@/lib/utils';
import { TON_STREIFEN } from '@/lib/designTon';

const ZELLE = 'text-left px-4 py-3.5 min-w-0 border-border border-t [&:nth-child(-n+2)]:border-t-0 md:border-t-0 md:[&:not(:first-child)]:border-l';

// Eine Leiste statt vieler Kacheln — Trennlinien statt Zwischenräume.
export default function Kennzahlleiste({ werte = [] }) {
  return (
    <div className="bg-card border rounded-lg grid grid-cols-2 md:grid-cols-none md:grid-flow-col md:auto-cols-fr">
      {werte.map((w, i) => {
        const Element = w.onClick ? 'button' : 'div';
        return (
          <Element
            key={i}
            type={w.onClick ? 'button' : undefined}
            onClick={w.onClick}
            className={cn(ZELLE, (w.ton === 'attention' || w.ton === 'critical') && TON_STREIFEN[w.ton])}
          >
            <p className="text-label uppercase text-muted-foreground truncate">{w.label}</p>
            <p className="text-kpi text-foreground tabular-nums">{w.wert}</p>
            {w.hinweis && (
              <p className={cn('text-meta truncate', w.ton === 'done' ? 'text-status-done-text' : 'text-muted-foreground')}>
                {w.hinweis}
              </p>
            )}
          </Element>
        );
      })}
    </div>
  );
}