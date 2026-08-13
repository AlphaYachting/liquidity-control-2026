import React from 'react';
import { fmtEUR } from '@/lib/restructuring/restructuringFormat';

/**
 * Fortführungsnachweis-Kennzahlen aus dem 13-Wochen-Plan:
 * kumulierte Masseverbindlichkeiten vs. kumulierte Neuleistung,
 * Deckungsgrad, Lücke und Umschlagpunkt.
 */
export default function Week13CoverageBlock({ coverage, weeks }) {
  if (!coverage) return null;
  const t = coverage.turnaroundWeekIndex;

  const tiles = [
    { label: 'Masseverbindlichkeiten kumuliert', value: fmtEUR(coverage.cumMasse) },
    { label: 'Neuleistung kumuliert', value: fmtEUR(coverage.cumNeu) },
    {
      label: 'Deckungsgrad (kumuliert)',
      value: coverage.coveragePct === null ? '—' : `${coverage.coveragePct.toFixed(0)} %`,
      tone: coverage.coveragePct !== null && coverage.coveragePct >= 100 ? 'good' : 'bad',
    },
    { label: 'Lücke', value: fmtEUR(coverage.gap), tone: coverage.gap > 0 ? 'bad' : 'good' },
    {
      label: 'Umschlagpunkt (Deckung ≥ 100 %)',
      value: t >= 0 ? `Woche ${t + 1}` : `nicht innerhalb von ${weeks} Wochen`,
      tone: t >= 0 ? 'good' : 'bad',
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-xs font-bold mb-2">Fortführungsnachweis — Neuleistung vs. Masseverbindlichkeiten</p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {tiles.map((k) => (
          <div key={k.label} className="rounded-md bg-card border border-border/60 p-2">
            <p className="text-[10px] text-muted-foreground">{k.label}</p>
            <p className={`text-sm font-bold tabular-nums ${k.tone === 'bad' ? 'text-red-700' : k.tone === 'good' ? 'text-emerald-700' : ''}`}>
              {k.value}
            </p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">
        {coverage.openingDateMissing
          ? 'Kein Stichtag der Insolvenzeröffnung gepflegt — Alt/Neu-Abgrenzung nicht möglich, alle Einzahlungen gelten als NEU.'
          : 'Abgrenzung geschätzt: Der Leistungszeitraum liegt an den Rechnungen nicht vor, die Alt/Neu-Zuordnung erfolgt hilfsweise am Rechnungsdatum gegen den Eröffnungsstichtag.'}
      </p>
    </div>
  );
}