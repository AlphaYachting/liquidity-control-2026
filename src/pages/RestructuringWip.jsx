import React, { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle } from 'lucide-react';
import { useRestructuringData } from '@/lib/restructuring/useRestructuringData';
import { buildWip } from '@/lib/restructuring/restructuringEngine';
import { fmtEUR, fmtNum, fmtPct } from '@/lib/restructuring/restructuringFormat';
import { exportPDF, exportExcel } from '@/lib/restructuring/restructuringExport';
import ReportCard from '@/components/restructuring/ReportCard';
import ReportTable from '@/components/restructuring/ReportTable';
import StatTile from '@/components/restructuring/StatTile';

const SOURCE = 'awork-Zeitbuchungen (unverrechnet) × Mischsatz · Budget aus awork-Projektbudget';
const OVERRUN_WARN = 10; // Warnung ab 10% Überschreitung

export default function RestructuringWip() {
  const { data, isLoading } = useRestructuringData();
  const rate = data?.setting?.wip_blended_hourly_rate || 0;
  const wip = useMemo(
    () => (data ? buildWip(data.timeEntries, data.projects, rate, data.projectSnapshots) : null),
    [data, rate],
  );

  if (isLoading || !wip) {
    return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-72" /></div>;
  }

  const columns = [
    { key: 'project_name', label: 'Projekt' },
    { key: 'hours', label: 'Unverrechnete Std.', align: 'right', render: (r) => fmtNum(r.hours) },
    { key: 'budgetHours', label: 'Budget-Std.', align: 'right', render: (r) => (r.budgetHours > 0 ? fmtNum(r.budgetHours) : '—') },
    { key: 'actualHours', label: 'Ist-Std.', align: 'right', render: (r) => fmtNum(r.actualHours) },
    {
      key: 'overrunPct', label: 'Überschreitung', align: 'right',
      render: (r) => (r.overrunPct === null ? '—' : <span className={r.overrunPct > OVERRUN_WARN ? 'text-red-600 font-semibold' : ''}>{r.overrunPct > 0 ? '+' : ''}{fmtPct(r.overrunPct)}</span>),
    },
    { key: 'value', label: 'Leistungswert', align: 'right', render: (r) => fmtEUR(r.value), className: 'font-bold' },
  ];

  const exportRows = wip.rows.map((r) => [
    r.project_name, r.hours.toFixed(2),
    r.budgetHours > 0 ? r.budgetHours.toFixed(2) : '',
    r.actualHours.toFixed(2),
    r.overrunPct === null ? '' : `${r.overrunPct.toFixed(1)}%`,
    r.value.toFixed(2),
  ]);
  const exportCols = columns.map((c) => c.label);
  const overrunCount = wip.rows.filter((r) => r.overrunPct !== null && r.overrunPct > OVERRUN_WARN).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatTile label="WIP unverrechnet (Wert)" value={fmtEUR(wip.totalValue)} tone="positive" sub={rate > 0 ? `Mischsatz ${fmtEUR(rate)}/h` : 'Kein Satz gesetzt'} />
        <StatTile label="Unverrechnete Stunden" value={fmtNum(wip.totalHours, 1)} />
        <StatTile label="Budgetüberschreitungen" value={String(overrunCount)} tone={overrunCount > 0 ? 'warning' : 'default'} sub={`ab +${OVERRUN_WARN}%`} />
      </div>

      {rate <= 0 && (
        <div className="flex items-start gap-2 text-xs text-amber-800 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>Kein WIP-Mischsatz hinterlegt — Leistungswerte sind 0. Bitte unter „Eingaben & Annahmen" pflegen.</span>
        </div>
      )}

      <ReportCard
        title="WIP / Unfertige Leistungen"
        sourceNote={SOURCE}
        onExportPDF={() => exportPDF('WIP-Unfertige-Leistungen', exportCols, exportRows, {
          sourceNote: SOURCE, numericCols: [1, 2, 3, 4, 5],
          summaryLines: [
            `Unverrechnete Stunden gesamt: ${fmtNum(wip.totalHours, 1)} h`,
            `Leistungswert gesamt: ${fmtEUR(wip.totalValue)}`,
            `Mischsatz: ${fmtEUR(rate)} / h`,
          ],
        })}
        onExportExcel={() => exportExcel('WIP-Unfertige-Leistungen', exportCols, exportRows, SOURCE)}
      >
        <ReportTable
          columns={columns}
          rows={wip.rows}
          rowClassName={(r) => (r.overrunPct !== null && r.overrunPct > OVERRUN_WARN ? 'bg-red-50/50' : '')}
          totalRow={['Summe', fmtNum(wip.totalHours), '', '', '', fmtEUR(wip.totalValue)]}
        />
      </ReportCard>
    </div>
  );
}