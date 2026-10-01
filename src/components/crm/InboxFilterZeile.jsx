import React from 'react';
import { ArrowUpDown, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FILTER, SCHWELLE_ARBEITSSTUNDEN } from '@/lib/crm/posteingang';

// Reiter über der EINEN Liste — sie filtern, sie zerlegen die Liste nicht in Spalten.
export default function InboxFilterZeile({ filter, onFilter, zahlen, neuesteZuerst, onSortierung, jungAnzahl = 0, zeigeJung, onZeigeJung }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex gap-1 border-b flex-1 min-w-[320px]">
        {FILTER.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => onFilter(r.key)}
            className={cn(
              'h-[38px] px-3 -mb-px border-b-2 text-body font-medium inline-flex items-center gap-1.5',
              filter === r.key
                ? 'border-foreground text-foreground font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {r.label}
            <span className="rounded-full bg-muted px-1.5 text-[12px] font-semibold text-muted-foreground">
              {zahlen[r.key] || 0}
            </span>
          </button>
        ))}
      </div>
      <Button
        size="sm"
        variant={zeigeJung ? 'default' : 'outline'}
        onClick={onZeigeJung}
        title={`Nachrichten, die noch keine ${SCHWELLE_ARBEITSSTUNDEN} Arbeitsstunden (Mo–Fr 8–17 Uhr) unbeantwortet sind`}
      >
        <Clock /> Jünger als {SCHWELLE_ARBEITSSTUNDEN} h ({jungAnzahl})
      </Button>
      <Button size="sm" variant="outline" onClick={onSortierung}>
        <ArrowUpDown /> {neuesteZuerst ? 'Neueste zuerst' : 'Älteste zuerst'}
      </Button>
    </div>
  );
}
