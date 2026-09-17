// Die fünf Statustöne der App — Farbe entsteht nur hier, nie in einer Seite.
export const TON_TEXT = {
  neutral: 'text-foreground',
  info: 'text-status-info',
  attention: 'text-status-attention',
  critical: 'text-status-critical',
  done: 'text-status-done-text',
};

export const TON_STREIFEN = {
  attention: 'shadow-[inset_3px_0_0_hsl(var(--status-attention))]',
  critical: 'shadow-[inset_3px_0_0_hsl(var(--status-critical))]',
  primary: 'shadow-[inset_3px_0_0_hsl(var(--primary))]',
};

export const schweregradZuTon = (s) =>
  s === 'kritisch' ? 'critical' : s === 'warnung' ? 'attention' : 'neutral';