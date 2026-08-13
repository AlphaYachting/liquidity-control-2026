import React from 'react';
import { fmtEUR, fmtPct } from '@/lib/restructuring/restructuringFormat';

const Tile = ({ label, value, hint, tone }) => (
  <div className="rounded-lg border border-border p-3">
    <p className="text-[11px] text-muted-foreground">{label}</p>
    <p className={`text-base font-bold tabular-nums mt-0.5 ${tone || ''}`}>{value}</p>
    {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
  </div>
);

export default function ContinuationKpiBlock({ title, kpis, hearingWeek, weekCount }) {
  const cov = (v) => (v === null || v === undefined ? 'nicht berechenbar' : fmtPct(v));
  const tone = (v) => (Number(v) < 0 ? 'text-red-700' : 'text-emerald-700');

  return (
    <div>
      <h3 className="text-xs font-bold mb-2">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <Tile
          label="Deckungsgrad bis Berichtstagsatzung"
          value={cov(kpis.coverage_until_hearing)}
          hint={hearingWeek ? `kumuliert bis Woche ${hearingWeek - 1}` : 'kein Termin hinterlegt'}
        />
        <Tile
          label="Lücke bis Berichtstagsatzung"
          value={kpis.gap_until_hearing === null ? '—' : fmtEUR(kpis.gap_until_hearing)}
          tone={tone(kpis.gap_until_hearing)}
          hint="negativ = aus Altvermögen getragen"
        />
        <Tile label="Deckungsgrad volle Planwochen" value={cov(kpis.coverage_full)} hint={`Woche 1–${weekCount}`} />
        <Tile
          label="Ergebnis volle Planwochen"
          value={kpis.result_full === null ? '—' : fmtEUR(kpis.result_full)}
          tone={tone(kpis.result_full)}
        />
        <Tile
          label="Umschlagpunkt"
          value={kpis.turning_point ? `Woche ${kpis.turning_point}` : 'nicht erreicht'}
          hint={kpis.turning_point
            ? 'erste Woche mit kumuliertem Deckungsgrad ≥ 100 %'
            : 'Deckungsgrad erreicht im Planhorizont keine 100 %'}
          tone={kpis.turning_point ? 'text-emerald-700' : 'text-red-700'}
        />
      </div>
    </div>
  );
}