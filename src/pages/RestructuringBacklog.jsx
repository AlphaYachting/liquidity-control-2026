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
    () => (data ? buildOrderBacklog(data.orders, data.projects, data.invoices, data.setting?.default_vat_rate) : null),
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
    { key: 'invoiced', label: 'Verrechnet', align: 'right', render: (r) => (
      <span>
        {fmtEUR(r.invoiced)}
        {r.invoiced_estimated && (
          <span className="block text-[10px] font-semibold text-amber-700">Zuordnung geschätzt</span>
        )}
      </span>
    ) },
    { key: 'remaining', label: 'Restwert', align: 'right', render: (r) => fmtEUR(r.remaining), className: 'font-bold' },
  ];

  const exportRows = backlog.rows.map((r) => [
    r.order_number, r.customer, r.project_name,
    r.expected_month ? monthLabel(r.expected_month) : 'ohne Termin',
    r.total.toFixed(2),
    `${r.invoiced.toFixed(2)}${r.invoiced_estimated ? ' (Zuordnung geschätzt)' : ''}`,
    r.remaining.toFixed(2),
  ]);
  const exportCols = columns.map((c) => c.label);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatTile label="Auftragsbestand gesamt (Restwert)" value={fmtEUR(backlog.total)} tone="positive" />
        <StatTile label="Anzahl offener Aufträge" value={String(backlog.rows.length)} />
        <StatTile label="Ohne Rechnungstermin" value={fmtEUR(byMonth['ohne Termin'] || 0)} tone={byMonth['ohne Termin'] ? 'warning' : 'default'} sub="Kein erwarteter Monat gesetzt" />
        <StatTile
          label="Geschätzte Zuordnungen"
          value={fmtEUR(backlog.estimatedAssigned)}
          tone={backlog.estimatedAssigned > 0 ? 'warning' : 'default'}
          sub={`${backlog.estimatedCount} Aufträge — verrechnete Beträge nur über den Kundennamen zugeordnet, anteilig nach Auftragssumme verteilt`}
        />
        <StatTile label="Auftragsbestand brutto" value={fmtEUR(backlog.totalGross)} sub="Restwert inkl. USt" />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Hart zugeordnet = Rechnung trägt die Auftragsnummer. „Zuordnung geschätzt" = der über den Kundennamen
        ermittelte Rechnungsbetrag wurde anteilig nach Auftragssumme auf die Aufträge dieses Kunden verteilt.
      </p>

      <ReportCard
        title="Auftragsbestand"
        sourceNote={SOURCE}
        onExportPDF={() => exportPDF('Auftragsbestand', exportCols, exportRows, {
          sourceNote: SOURCE, numericCols: [4, 5, 6],
          summaryLines: [
            `Restwert gesamt (netto): ${fmtEUR(backlog.total)}`,
            `Restwert gesamt (brutto): ${fmtEUR(backlog.totalGross)}`,
            `Offene Aufträge: ${backlog.rows.length}`,
            `Davon geschätzt zugeordnete Verrechnungen: ${fmtEUR(backlog.estimatedAssigned)} (${backlog.estimatedCount} Aufträge)`,
          ],
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