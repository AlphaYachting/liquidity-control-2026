import React, { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle } from 'lucide-react';
import { useRestructuringData } from '@/lib/restructuring/useRestructuringData';
import { build13Week } from '@/lib/restructuring/restructuringEngine';
import { fmtEUR, fmtDate } from '@/lib/restructuring/restructuringFormat';
import { exportPDF, exportExcel } from '@/lib/restructuring/restructuringExport';
import ReportCard from '@/components/restructuring/ReportCard';
import ReportTable from '@/components/restructuring/ReportTable';

const SOURCE = 'Bankbestand + fällige Debitoren + Retainer/Hosting + Auftragsbestand − erfasste Auszahlungen';

export default function Restructuring13Week() {
  const { data, isLoading } = useRestructuringData();
  const result = useMemo(() => (data ? build13Week(data) : null), [data]);

  if (isLoading || !result) {
    return <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-96" /></div>;
  }

  const weekRange = (r) => `${fmtDate(r.week_start)} – ${fmtDate(r.week_end)}`;

  const columns = [
    { key: 'week', label: 'Woche', render: (r) => `KW ${r.index + 1}` },
    { key: 'range', label: 'Zeitraum', render: weekRange },
    { key: 'opening', label: 'Anfangsbestand', align: 'right', render: (r) => fmtEUR(r.opening) },
    { key: 'inflow', label: 'Einzahlungen', align: 'right', render: (r) => fmtEUR(r.inflow) },
    { key: 'outflow', label: 'Auszahlungen', align: 'right', render: (r) => fmtEUR(r.outflow) },
    { key: 'closing', label: 'Endbestand', align: 'right', render: (r) => fmtEUR(r.closing), className: 'font-bold' },
  ];

  const exportRows = result.rows.map((r) => [
    `KW ${r.index + 1}`, weekRange(r), r.opening.toFixed(2), r.inflow.toFixed(2), r.outflow.toFixed(2), r.closing.toFixed(2),
  ]);
  const exportCols = columns.map((c) => c.label);

  const hasNegative = result.rows.some((r) => r.negative);
  const lowest = Math.min(...result.rows.map((r) => r.closing));

  return (
    <div className="space-y-4">
      {!result.openingSnap && (
        <div className="flex items-start gap-2 text-xs text-amber-800 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>Kein Bankanfangsbestand erfasst — Vorschau startet bei 0. Bitte unter „Eingaben & Annahmen" pflegen.</span>
        </div>
      )}
      {hasNegative && (
        <div className="flex items-start gap-2 text-xs text-red-800 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>Liquiditätsunterschreitung erkannt — tiefster Endbestand {fmtEUR(lowest)}. Rot markierte Wochen weisen einen negativen Endbestand aus.</span>
        </div>
      )}

      <ReportCard
        title="13-Wochen-Liquiditätsvorschau (rollierend)"
        sourceNote={SOURCE}
        onExportPDF={() => exportPDF('13-Wochen-Vorschau', exportCols, exportRows, {
          sourceNote: SOURCE, numericCols: [2, 3, 4, 5],
          summaryLines: [`Anfangsbestand: ${fmtEUR(result.openingBalance)}`, `Tiefster Endbestand: ${fmtEUR(lowest)}`],
        })}
        onExportExcel={() => exportExcel('13-Wochen-Vorschau', exportCols, exportRows, SOURCE)}
      >
        <p className="text-[11px] text-muted-foreground mb-3">
          Anfangsbestand {fmtEUR(result.openingBalance)}
          {result.openingSnap && <span> (Stand {fmtDate(result.openingSnap.balance_date)})</span>}
        </p>
        <ReportTable
          columns={columns}
          rows={result.rows}
          rowClassName={(r) => (r.negative ? 'bg-red-50 text-red-700' : '')}
        />
      </ReportCard>
    </div>
  );
}