import React from 'react';
import { fmtEUR, fmtPct, fmtDate } from '@/lib/restructuring/restructuringFormat';

const Tile = ({ label, value, tone, strong, hint }) => (
  <div className={`rounded-lg border p-3 ${strong ? 'bg-card border-2' : 'bg-muted/40'} ${
    tone === 'positive' ? 'border-emerald-500' : tone === 'negative' ? 'border-red-500' : ''
  }`}>
    <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
    <div className={`mt-1 ${strong ? 'text-xl font-bold' : 'text-base font-medium'} ${
      tone === 'positive' ? 'text-emerald-600' : tone === 'negative' ? 'text-red-600' : ''
    }`}>{value}</div>
    {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
  </div>
);

export default function SollIstSummary({ totals, hearingDate, proofWeeks, recordedWeeks }) {
  const t = totals;
  const surplusTone = t.actual_surplus === null ? undefined : t.actual_surplus >= 0 ? 'positive' : 'negative';
  const coverageTone = t.actual_coverage === null ? undefined : t.actual_coverage >= 100 ? 'positive' : 'negative';

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Nachweiszeitraum: {proofWeeks} Wochen bis zur Berichtstagsatzung am {fmtDate(hearingDate)} — davon {recordedWeeks} Wochen mit Ist-Erfassung.
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Tile label="Plan Einzahlungen" value={fmtEUR(t.plan_inflow)} />
        <Tile label="Ist Einzahlungen" value={t.actual_inflow === null ? '—' : fmtEUR(t.actual_inflow)} />
        <Tile label="Plan Auszahlungen" value={fmtEUR(t.plan_outflow)} />
        <Tile label="Ist Auszahlungen" value={t.actual_outflow === null ? '—' : fmtEUR(t.actual_outflow)} />
        <Tile label="Plan Überschuss" value={fmtEUR(t.plan_surplus)} />
        <Tile label="Plan Deckungsgrad" value={t.plan_coverage === null ? 'nicht berechenbar' : fmtPct(t.plan_coverage)} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Tile
          strong
          label="Ist-Überschuss"
          tone={surplusTone}
          value={t.actual_surplus === null ? '— keine Ist-Erfassung' : fmtEUR(t.actual_surplus)}
          hint="Positiv bedeutet: die Fortführung hat die Masse gemehrt."
        />
        <Tile
          strong
          label="Ist-Deckungsgrad"
          tone={coverageTone}
          value={t.actual_coverage === null ? '— keine Ist-Erfassung' : fmtPct(t.actual_coverage)}
          hint="Über 100 Prozent bedeutet: der Betrieb verdient seine Masseverbindlichkeiten selbst."
        />
      </div>
    </div>
  );
}