import React from 'react';
import { cn } from '@/lib/utils';

const FLAECHE = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-status-info-surface text-status-info',
  attention: 'bg-status-attention-surface text-status-attention',
  critical: 'bg-status-critical-surface text-status-critical',
  done: 'bg-status-done-surface text-status-done-text',
};

const PUNKT = {
  neutral: 'bg-current',
  info: 'bg-current',
  attention: 'bg-current',
  critical: 'bg-current',
  done: 'bg-status-done',
};

// Statusetikett — kleiner Punkt plus Versalien, in genau einem der fünf Töne.
export default function StatusEtikett({ ton = 'neutral', title, children }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 h-5 px-[7px] rounded-[3px] text-[11px] font-semibold uppercase tracking-[0.04em] whitespace-nowrap',
        FLAECHE[ton] || FLAECHE.neutral,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', PUNKT[ton] || 'bg-current')} />
      {children}
    </span>
  );
}