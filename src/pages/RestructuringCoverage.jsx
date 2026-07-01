import React, { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useRestructuringData } from '@/lib/restructuring/useRestructuringData';
import { buildRevenueForecast, buildCoverage } from '@/lib/restructuring/restructuringEngine';
import { fmtEUR, monthLabel } from '@/lib/restructuring/restructuringFormat';
import { exportPDF, exportExcel } from '@/lib/restructuring/restructuringExport';
import ReportCard from '@/components/restructuring/ReportCard';
import ReportTable from '@/components/restructuring/ReportTable';
import StatTile from '@/components/restructuring/StatTile';

const SOURCE = 'Umsatz-Forecast − erfasste monatliche Auszahlungen';

export default function RestructuringCoverage() {
  const { data, isLoading } = useRestructuringData();
  const horizon = data?.setting?.planning_horizon_months || 12;

  const coverage = useMemo(() => {
    if (!data) return null;
    const forecast = buildRevenueForecast({ ...data, horizonMonths: horizon });
    return buildCoverage({ forecast, outflowItems: data.outflowItems, horizonMonths: horizon });
  }, [data, horizon]);

  if (isLoading || !coverage) {
    return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-72" /></div>;
  }

  const columns = [
    { key: 'month', label: 'Monat', render: (r) => monthLabel(r.month) },
    { key: 'revenue', label: 'Forecast-Umsatz', align: 'right', render: (r) => fmtEUR(r.revenue) },
    { key: 'costs', label: 'Geplante Kosten', align: 'right', render: (r) => fmtEUR(r.costs) },
    {
      key: 'surplus', label: 'Operativer Überschuss', align: 'right',
      render: (r) => <span className={r.surplus < 0 ? 'text-red-600 font-medium' : 'font-medium'}>{fmtEUR(r.surplus)}</span>,
    },
    {
      key: 'cumulative', label: 'Kumuliert', align: 'right',
      render: (r) => <span className={r.cumulative < 0 ? 'text-red-600 font-bold' : 'font-bold'}>{fmtEUR(r.cumulative)}</span>,
    },
  ];

  const exportRows = coverage.rows.map((r) => [
    monthLabel(r.month), r.revenue.toFixed(2), r.costs.toFixed(2), r.surplus.toFixed(2), r.cumulative.toFixed(2),
  ]);
  const exportCols = columns.map((c) => c.label);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatTile label="Forecast-Umsatz (Σ)" value={fmtEUR(coverage.totalRevenue)} sub={`${horizon} Monate`} />
        <StatTile label="Geplante Kosten (Σ)" value={fmtEUR(coverage.totalCosts)} sub={`${horizon} Monate`} />
        <StatTile
          label="Verfügbarer Überschuss (Σ)"
          value={fmtEUR(coverage.totalSurplus)}
          tone={coverage.totalSurplus < 0 ? 'negative' : 'positive'}
          sub="Ohne automatische Quotenberechnung"
        />
      </div>

      <ReportCard
        title="Deckungsgrundlage — operativer Überschuss"
        sourceNote={SOURCE}
        onExportPDF={() => exportPDF('Deckungsgrundlage', exportCols, exportRows, {
          sourceNote: SOURCE, numericCols: [1, 2, 3, 4],
          summaryLines: [
            `Forecast-Umsatz gesamt: ${fmtEUR(coverage.totalRevenue)}`,
            `Geplante Kosten gesamt: ${fmtEUR(coverage.totalCosts)}`,
            `Verfügbarer operativer Überschuss: ${fmtEUR(coverage.totalSurplus)}`,
            'Hinweis: Keine automatische Quotenberechnung — nur verfügbarer Überschuss ausgewiesen.',
          ],
        })}
        onExportExcel={() => exportExcel('Deckungsgrundlage', exportCols, exportRows, SOURCE)}
      >
        <p className="text-[11px] text-muted-foreground mb-3">
          Prognostizierter operativer Überschuss (Forecast-Umsatz − geplante Kosten), monatlich und kumuliert.
          Keine automatische Quotenberechnung.
        </p>
        <ReportTable
          columns={columns}
          rows={coverage.rows}
          totalRow={['Summe', fmtEUR(coverage.totalRevenue), fmtEUR(coverage.totalCosts), fmtEUR(coverage.totalSurplus), '']}
        />
      </ReportCard>
    </div>
  );
}