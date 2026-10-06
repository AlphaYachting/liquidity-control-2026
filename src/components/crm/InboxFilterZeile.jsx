import React from 'react';
import { ArrowUpDown, Clock, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FILTER, SCHWELLE_ARBEITSSTUNDEN } from '@/lib/crm/posteingang';

// Reiter über der EINEN Liste — sie filtern, sie zerlegen die Liste nicht in Spalten.
// Darunter: Suche (grenzt die gewählte Sicht ein), jüngere Nachrichten, Sortierung.
// Im Kanal (Office) zählt „Alle“ alles, was an die Adresse ging — auch Verwaltung.
export default function InboxFilterZeile({
  filter, onFilter, zahlen, reiterAnzeigen = true, imKanal = false,
  suche = '', onSuche, neuesteZuerst, onSortierung, jungAnzahl = 0, zeigeJung, onZeigeJung,
}) {
  return (
    <div className="space-y-2">
      {reiterAnzeigen && (
        <div className="flex gap-1 border-b overflow-x-auto">
          {FILTER.filter((r) => r.key === 'alle' || !r.nurWennVorhanden || (zahlen[r.key] || 0) > 0)
            // Im Kanal braucht es den Reiter „Möglicher Support“ nur, wenn es dort welche gibt
            .filter((r) => !imKanal || r.key !== 'moeglich' || (zahlen[r.key] || 0) > 0)
            .map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => onFilter(r.key)}
                className={cn(
                  'h-[38px] px-3 -mb-px border-b-2 text-body font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0',
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
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={suche}
            onChange={(e) => onSuche?.(e.target.value)}
            placeholder="Mails durchsuchen – Betreff, Absender, Kunde, Text"
            className="pl-8 pr-8 h-9"
          />
          {suche && (
            <button
              type="button"
              onClick={() => onSuche?.('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Suche leeren"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <span className="flex-1" />
        {(jungAnzahl > 0 || zeigeJung) && (
          <Button
            size="sm"
            variant={zeigeJung ? 'default' : 'outline'}
            onClick={onZeigeJung}
            title={`Nachrichten, die noch keine ${SCHWELLE_ARBEITSSTUNDEN} Arbeitsstunden (Mo–Fr 8–17 Uhr) unbeantwortet sind`}
          >
            <Clock /> Jünger als {SCHWELLE_ARBEITSSTUNDEN} h ({jungAnzahl})
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onSortierung}>
          <ArrowUpDown /> {neuesteZuerst ? 'Neueste zuerst' : 'Älteste zuerst'}
        </Button>
      </div>
    </div>
  );
}
