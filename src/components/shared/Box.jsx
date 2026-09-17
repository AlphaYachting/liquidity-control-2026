import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TON_STREIFEN } from '@/lib/designTon';

// Die Grundhülle aller Inhalte: weiße Fläche, 1 px Kontur, 4 px Ecken, kein Schatten.
export function Box({ streifen, className, children }) {
  return (
    <div className={cn('bg-card border rounded-lg', TON_STREIFEN[streifen], className)}>
      {children}
    </div>
  );
}

// Kopfzeile einer Box — Titel immer in Satzschreibung.
export function BoxKopf({
  titel, symbol: Symbol, zaehler, hinweis, aktion,
  einklappbar = false, offen = true, onToggle, children,
}) {
  return (
    <div className={cn('flex items-center gap-2.5 px-4 min-h-[52px]', offen && 'border-b')}>
      {einklappbar && (
        <button type="button" onClick={onToggle} aria-expanded={offen} className="shrink-0">
          <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', !offen && '-rotate-90')} />
        </button>
      )}
      {Symbol && <Symbol className="w-4 h-4 text-muted-foreground shrink-0" />}
      <h3
        className={cn('text-value text-foreground whitespace-nowrap', einklappbar && 'cursor-pointer')}
        onClick={einklappbar ? onToggle : undefined}
      >
        {titel}
      </h3>
      {zaehler != null && (
        <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-muted text-muted-foreground text-[11px] font-semibold inline-flex items-center justify-center">
          {zaehler}
        </span>
      )}
      {hinweis && <span className="text-meta text-muted-foreground truncate">{hinweis}</span>}
      {children}
      {aktion && <div className="ml-auto flex items-center gap-2 shrink-0">{aktion}</div>}
    </div>
  );
}

export function BoxInhalt({ className, children }) {
  return <div className={cn('p-4 space-y-3', className)}>{children}</div>;
}