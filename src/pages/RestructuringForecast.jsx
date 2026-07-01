import React, { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useRestructuringData } from '@/lib/restructuring/useRestructuringData';
import { buildRevenueForecast } from '@/lib/restructuring/restructuringEngine';
import { fmtEUR, monthLabel } from '@/lib/restructuring/restructuringFormat';
import { exportPDF, exportExcel } from '@/lib/restructuring/restructuringExport';
import ReportCard from '@/components/restructuring/ReportCard';
import ReportTable from '@/components/restructuring/ReportTable';
import StatTile from '@/components/restructuring/StatTile';

const SOURCE = 'Gesichert wiederkehrend (Retainer + Hosting) + Auftragsbestand (Restwert nach erwartetem Rechnungsmonat)';

export default function RestructuringForecast() {
  const { data, isLoading } = useRestructuringData();
  const horizon = data?.setting?.planning_horizon_months || 12;
  const fc = useMemo(
    () => (data ? buildRevenueForecast({ ...data, horizonMonths: horizon }) : null),
    [data, horizon],
  );

  if (isLoading || !fc) {
    return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-72" /></div>;
  }

  const columns = [
    { key: 'month', label: 'Monat', render: (r) => monthLabel(r.month) },
    { key: 'recurring', label: 'Gesichert wiederkehrend', align: 'right', render: (r) => fmtEUR(r.recurring) },
    { key: 'backlog', label: 'Gesichert aus Auftragsbestand', align: 'right', render: (r) => fmtEUR(r.backlog) },
    { key: 'pipeline', label: 'Gewichtete Pipeline', align: 'right', render: (r) => fmtEUR(r.pipeline) },
    { key: 'total', label: 'Summe Monat', align: 'right', render: (r) => fmtEUR(r.total), className: 'font-bold' },
  ];

  const exportRows = fc.rows.map((r) => [
    monthLabel(r.month), r.recurring.toFixed(2), r.backlog.toFixed(2), r.pipeline.toFixed(2), r.total.toFixed(2),
  ]);
  const exportCols = columns.map((c) => c.label);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Gesichert wiederkehrend (Σ)" value={fmtEUR(fc.totalRecurring)} sub={`${horizon} Monate`} />
        <StatTile label="Gesichert Auftragsbestand (Σ)" value={fmtEUR(fc.totalBacklog)} sub={`${horizon} Monate`} />
        <StatTile label="Gesamt-Forecast" value={fmtEUR(fc.total)} tone="positive" sub={`${horizon} Monate`} />
        <StatTile label="Rollierende 12-Monats-Summe" value={fmtEUR(fc.rolling12)} />
      </div>

      <ReportCard
        title={`Umsatz-Forecast (${horizon} Monate, monatlich)`}
        sourceNote={SOURCE}
        onExportPDF={() => exportPDF('Umsatz-Forecast', exportCols, exportRows, {
          sourceNote: SOURCE, numericCols: [1, 2, 3, 4],
          summaryLines: [
            `Gesichert wiederkehrend: ${fmtEUR(fc.totalRecurring)}`,
            `Gesichert Auftragsbestand: ${fmtEUR(fc.totalBacklog)}`,
            `Gesamt: ${fmtEUR(fc.total)}`,
            `Rollierende 12-Monats-Summe: ${fmtEUR(fc.rolling12)}`,
          ],
        })}
        onExportExcel={() => exportExcel('Umsatz-Forecast', exportCols, exportRows, SOURCE)}
      >
        <ReportTable
          columns={columns}
          rows={fc.rows}
          totalRow={['Summe', fmtEUR(fc.totalRecurring), fmtEUR(fc.totalBacklog), fmtEUR(0), fmtEUR(fc.total)]}
        />
      </ReportCard>
    </div>
  );
}