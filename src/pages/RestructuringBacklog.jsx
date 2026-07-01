import React, { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useRestructuringData } from '@/lib/restructuring/useRestructuringData';
import { buildOrderBacklog } from '@/lib/restructuring/restructuringEngine';
import { fmtEUR, monthLabel } from '@/lib/restructuring/restructuringFormat';
import { exportPDF, exportExcel } from '@/lib/restructuring/restructuringExport';
import ReportCard from '@/components/restructuring/ReportCard';
import ReportTable from '@/components/restructuring/ReportTable';
import StatTile from '@/components/restructuring/StatTile';

const SOURCE = 'Bestätigte Aufträge (ConfirmedOrder) − verrechnete Beträge (InvoiceRecord)';

export default function RestructuringBacklog() {
  const { data, isLoading } = useRestructuringData();
  const backlog = useMemo(
    () => (data ? buildOrderBacklog(data.orders, data.projects, data.invoices) : null),
    [data],
  );

  if (isLoading || !backlog) {
    return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-72" /></div>;
  }

  // Gruppierung nach erwartetem Monat
  const byMonth = {};
  backlog.rows.forEach((r) => {
    const k = r.expected_month || 'ohne Termin';
    byMonth[k] = (byMonth[k] || 0) + r.remaining;
  });

  const columns = [
    { key: 'order_number', label: 'Auftragsnr.' },
    { key: 'customer', label: 'Kunde' },
    { key: 'project_name', label: 'Projekt' },
    { key: 'expected_month', label: 'Erw. Rechnungsmonat', render: (r) => (r.expected_month ? monthLabel(r.expected_month) : 'ohne Termin') },
    { key: 'total', label: 'Auftragswert', align: 'right', render: (r) => fmtEUR(r.total) },
    { key: 'invoiced', label: 'Verrechnet', align: 'right', render: (r) => fmtEUR(r.invoiced) },
    { key: 'remaining', label: 'Restwert', align: 'right', render: (r) => fmtEUR(r.remaining), className: 'font-bold' },
  ];

  const exportRows = backlog.rows.map((r) => [
    r.order_number, r.customer, r.project_name,
    r.expected_month ? monthLabel(r.expected_month) : 'ohne Termin',
    r.total.toFixed(2), r.invoiced.toFixed(2), r.remaining.toFixed(2),
  ]);
  const exportCols = columns.map((c) => c.label);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatTile label="Auftragsbestand gesamt (Restwert)" value={fmtEUR(backlog.total)} tone="positive" />
        <StatTile label="Anzahl offener Aufträge" value={String(backlog.rows.length)} />
        <StatTile label="Ohne Rechnungstermin" value={fmtEUR(byMonth['ohne Termin'] || 0)} tone={byMonth['ohne Termin'] ? 'warning' : 'default'} sub="Kein erwarteter Monat gesetzt" />
      </div>

      <ReportCard
        title="Auftragsbestand"
        sourceNote={SOURCE}
        onExportPDF={() => exportPDF('Auftragsbestand', exportCols, exportRows, {
          sourceNote: SOURCE, numericCols: [4, 5, 6],
          summaryLines: [`Restwert gesamt: ${fmtEUR(backlog.total)}`, `Offene Aufträge: ${backlog.rows.length}`],
        })}
        onExportExcel={() => exportExcel('Auftragsbestand', exportCols, exportRows, SOURCE)}
      >
        <ReportTable
          columns={columns}
          rows={backlog.rows}
          totalRow={['Summe', '', '', '', '', '', fmtEUR(backlog.total)]}
        />
      </ReportCard>
    </div>
  );
}