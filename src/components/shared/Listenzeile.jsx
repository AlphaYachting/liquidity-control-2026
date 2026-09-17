import React from 'react';
import { cn } from '@/lib/utils';
import { TON_STREIFEN, TON_TEXT } from '@/lib/designTon';

// Die Zeilenform der Projekte-Übersicht als allgemeiner Baustein.
// Mehrere Zeilen stehen in einer Box mit "divide-y".
export default function Listenzeile({
  typ, titel, label, zusatz, etikett, wert, wertHinweis,
  wertTon = 'neutral', aktion, streifen, onClick,
}) {
  return (
    <div
      onClick={onClick}
      className={cn('grid items-center gap-3.5 px-4 py-3', TON_STREIFEN[streifen], onClick && 'cursor-pointer hover:bg-muted/40')}
      style={{ gridTemplateColumns: `${typ !== undefined ? '104px ' : ''}minmax(0,1fr) auto 120px auto` }}
    >
      {typ !== undefined && <div>{typ}</div>}
      <div className="min-w-0">
        <p className="text-object text-foreground truncate">{titel}</p>
        {label && <p className="text-label uppercase text-muted-foreground truncate">{label}</p>}
        {zusatz && <p className="text-meta text-muted-foreground truncate">{zusatz}</p>}
      </div>
      <div>{etikett}</div>
      <div className="text-right">
        {wert != null && <p className={cn('text-value tabular-nums', TON_TEXT[wertTon])}>{wert}</p>}
        {wertHinweis && <p className="text-meta text-muted-foreground">{wertHinweis}</p>}
      </div>
      <div className="flex items-center gap-1.5 justify-end">{aktion}</div>
    </div>
  );
}