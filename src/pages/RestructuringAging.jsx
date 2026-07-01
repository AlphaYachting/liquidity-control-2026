import React, { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useRestructuringData } from '@/lib/restructuring/useRestructuringData';
import { buildAging } from '@/lib/restructuring/restructuringEngine';
import { fmtEUR, fmtDate } from '@/lib/restructuring/restructuringFormat';
import { exportPDF, exportExcel } from '@/lib/restructuring/restructuringExport';
import ReportCard from '@/components/restructuring/ReportCard';
import ReportTable from '@/components/restructuring/ReportTable';
import StatTile from '@/components/restructuring/StatTile';

const BUCKET_LABELS = { '0_30': '0–30 Tage', '31_60': '31–60 Tage', '61_90': '61–90 Tage', '90_plus': '> 90 Tage' };
const CLAIM_LABELS = { alt: 'Altforderung', neu: 'Neuforderung', unbekannt: '—' };
const SOURCE = 'Offene Debitorenrechnungen (InvoiceRecord)';

export default function RestructuringAging() {
  const { data, isLoading } = useRestructuringData();
  const aging = useMemo(() => (data ? buildAging(data.invoices, data.setting?.insolvency_opening_date) : null), [data]);
  const openingDate = data?.setting?.insolvency_opening_date;

  if (isLoading || !aging) {
    return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  }

  const columns = [
    { key: 'customer', label: 'Kunde' },
    { key: 'invoice_number', label: 'Rechnung' },
    { key: 'invoice_date', label: 'Rechnungsdatum', render: (r) => fmtDate(r.invoice_date) },
    { key: 'due_date', label: 'Fälligkeit', render: (r) => fmtDate(r.due_date) },
    { key: 'days', label: 'Alter (Tage)', align: 'right', render: (r) => (r.days > 0 ? r.days : '—') },
    { key: 'bucket', label: 'Bucket', render: (r) => BUCKET_LABELS[r.bucket] },
    ...(openingDate ? [{ key: 'claim_type', label: 'Alt/Neu', render: (r) => CLAIM_LABELS[r.claim_type] }] : []),
    { key: 'amount', label: 'Offener Betrag', align: 'right', render: (r) => fmtEUR(r.amount), className: 'font-medium' },
  ];

  const exportRows = aging.rows.map((r) => [
    r.customer, r.invoice_number, fmtDate(r.invoice_date), fmtDate(r.due_date),
    r.days > 0 ? r.days : 0, BUCKET_LABELS[r.bucket],
    ...(openingDate ? [CLAIM_LABELS[r.claim_type]] : []),
    r.amount.toFixed(2),
  ]);
  const exportCols = columns.map((c) => c.label);
  const numericCols = openingDate ? [4, 7] : [4, 6];

  const summary = [
    `Summe offen: ${fmtEUR(aging.total)}`,
    `Davon überfällig: ${fmtEUR(aging.overdue)}`,
    ...Object.entries(aging.buckets).map(([k, v]) => `${BUCKET_LABELS[k]}: ${fmtEUR(v)}`),
    ...(openingDate ? [`Altforderungen: ${fmtEUR(aging.alt)}`, `Neuforderungen: ${fmtEUR(aging.neu)}`] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(aging.buckets).map(([k, v]) => (
          <StatTile key={k} label={BUCKET_LABELS[k]} value={fmtEUR(v)} tone={k === '90_plus' && v > 0 ? 'negative' : 'default'} />
        ))}
      </div>

      {openingDate && (
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Altforderungen (vor Stichtag)" value={fmtEUR(aging.alt)} sub={`Stichtag ${fmtDate(openingDate)}`} />
          <StatTile label="Neuforderungen (nach Stichtag)" value={fmtEUR(aging.neu)} sub={`Stichtag ${fmtDate(openingDate)}`} tone="positive" />
        </div>
      )}

      <ReportCard
        title="Forderungsspiegel (Aging)"
        sourceNote={SOURCE + (openingDate ? ` · Alt/Neu-Split ab ${fmtDate(openingDate)}` : ' · kein Stichtag gesetzt')}
        onExportPDF={() => exportPDF('Forderungsspiegel', exportCols, exportRows, { sourceNote: SOURCE, summaryLines: summary, numericCols })}
        onExportExcel={() => exportExcel('Forderungsspiegel', exportCols, exportRows, SOURCE)}
      >
        <ReportTable
          columns={columns}
          rows={aging.rows}
          rowClassName={(r) => (r.days > 90 ? 'bg-red-50/50' : '')}
          totalRow={[
            'Summe', '', '', '', '', '',
            ...(openingDate ? [''] : []),
            fmtEUR(aging.total),
          ]}
        />
      </ReportCard>
    </div>
  );
}