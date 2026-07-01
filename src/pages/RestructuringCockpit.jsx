import React, { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle } from 'lucide-react';
import { useRestructuringData } from '@/lib/restructuring/useRestructuringData';
import { buildCockpit } from '@/lib/restructuring/restructuringEngine';
import { fmtEUR, fmtPct } from '@/lib/restructuring/restructuringFormat';
import StatTile from '@/components/restructuring/StatTile';

export default function RestructuringCockpit() {
  const { data, isLoading } = useRestructuringData();

  const c = useMemo(() => (data ? buildCockpit(data) : null), [data]);

  if (isLoading || !c) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  const warnings = [];
  if (!c.hasBank) warnings.push('Kein Bankanfangsbestand erfasst — Liquiditätswerte starten bei 0. Bitte unter „Eingaben & Annahmen" pflegen.');
  if (!c.hasRate) warnings.push('Kein WIP-Stundensatz hinterlegt — unverrechnete Leistungen werden mit 0 bewertet.');

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Liquidität</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatTile label="Liquidität heute" value={fmtEUR(c.liquidityToday)} tone={c.liquidityToday < 0 ? 'negative' : 'default'} sub="Bankanfangsbestand" />
          <StatTile label="Liquidität + 4 Wochen" value={fmtEUR(c.liquidity4w)} tone={c.liquidity4w < 0 ? 'negative' : 'positive'} sub="Prognose 13-Wochen-Vorschau" />
          <StatTile label="Liquidität + 13 Wochen" value={fmtEUR(c.liquidity13w)} tone={c.liquidity13w < 0 ? 'negative' : 'positive'} sub="Prognose 13-Wochen-Vorschau" />
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Umsatzbasis & Deckung</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatTile label="Gesicherter Recurring-Jahresumsatz" value={fmtEUR(c.recurringAnnual)} sub={`${fmtEUR(c.recurringMonthly)} / Monat · Retainer + Hosting`} />
          <StatTile
            label="Fixkostendeckungsgrad"
            value={fmtPct(c.coverageRatio)}
            tone={c.coverageRatio >= 100 ? 'positive' : c.coverageRatio >= 60 ? 'warning' : 'negative'}
            sub={`Recurring ÷ Monatsfixkosten (${fmtEUR(c.monthlyFixed)})`}
          />
          <StatTile label="Auftragsbestand gesamt" value={fmtEUR(c.backlogTotal)} sub="Restwert bestätigter Aufträge" />
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Forderungen & Leistungen</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatTile label="Offene Forderungen gesamt" value={fmtEUR(c.receivablesTotal)} sub="Offene Debitorenrechnungen" />
          <StatTile label="Davon überfällig" value={fmtEUR(c.receivablesOverdue)} tone={c.receivablesOverdue > 0 ? 'negative' : 'default'} sub="Nach Fälligkeitsdatum" />
          <StatTile
            label="WIP unverrechnet"
            value={fmtEUR(c.wipValue)}
            sub={`${c.wipHours.toFixed(1)} h × Mischsatz`}
            hint={!c.hasRate ? 'Kein Stundensatz hinterlegt' : undefined}
          />
        </div>
      </div>
    </div>
  );
}