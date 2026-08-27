import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, AlertTriangle } from 'lucide-react';
import KpiCard from '@/components/shared/KpiCard';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, calcOverdueDays } from '@/lib/liquidityUtils';

// Öffentliche Ansicht für den Masseverwalter — ohne Login, Zugriff über den Schlüssel im Link.
export default function MasseverwalterReport() {
  const { accessKey } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Direkter Aufruf des öffentlichen Endpunkts — ohne Login und ohne SDK-Token
    fetch('/functions/publicMasseverwalterReport', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: accessKey }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error || `Fehler ${res.status}`);
        setData(json);
      })
      .catch((e) => setError(e?.message || 'Bericht konnte nicht geladen werden'));
  }, [accessKey]);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center border rounded-xl bg-card p-8 max-w-sm">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
          <p className="text-sm font-semibold">Zugriff nicht möglich</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const invoices = (data?.invoices || []).map((r) => ({
    ...r,
    calc_overdue_days: calcOverdueDays(r.due_date),
  }));
  const istBezahlt = (r) => r.payment_status === 'paid' || (Number(r.open_amount) || 0) <= 0.01;
  const totalGross = invoices.reduce((s, r) => s + (Number(r.gross_amount) || 0), 0);
  const totalOpen = invoices.reduce((s, r) => s + (Number(r.open_amount) || 0), 0);
  const totalPaid = invoices.reduce((s, r) => s + (Number(r.paid_amount) || 0), 0);
  const totalOverdue = invoices
    .filter((r) => !istBezahlt(r) && r.calc_overdue_days > 0)
    .reduce((s, r) => s + (Number(r.open_amount) || 0), 0);
  const criticalCount = invoices.filter((r) => !istBezahlt(r) && r.calc_overdue_days > 30).length;
  const paidCount = invoices.filter(istBezahlt).length;

  const columns = [
    { key: 'payment_status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
    { key: 'customer_name', label: 'Kunde' },
    { key: 'invoice_number', label: 'RE-Nr.' },
    { key: 'invoice_date', label: 'RE-Datum' },
    { key: 'gross_amount', label: 'Brutto', render: (v) => formatCurrency(v), cellClass: 'text-right' },
    { key: 'paid_amount', label: 'Bezahlt', render: (v) => formatCurrency(v), cellClass: 'text-right' },
    { key: 'open_amount', label: 'Offen', render: (v) => formatCurrency(v), cellClass: 'text-right font-medium' },
    { key: 'due_date', label: 'Fällig' },
    {
      key: 'calc_overdue_days',
      label: 'Zahlungsstand',
      render: (v, row) => istBezahlt(row)
        ? <Badge className="bg-emerald-100 text-emerald-700">✓ Bezahlt</Badge>
        : v > 0
          ? <Badge className="bg-red-100 text-red-700">{v} Tage überfällig</Badge>
          : <Badge className="bg-slate-100 text-slate-700">offen, nicht fällig</Badge>,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Offene Forderungen — Bericht für den Masseverwalter</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Rittler & Co. — alle Rechnungen ab dem 24.07.2026 mit ihrem tatsächlichen Zahlungsstand, live aus der Buchhaltung (sevDesk)
              {data?.generated_at && ` · Stand: ${new Date(data.generated_at).toLocaleString('de-AT')}`}
            </p>
          </div>
        </div>

        {!data ? (
          <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-[400px]" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <KpiCard title="Fakturiert ab 24.07." value={formatCurrency(totalGross)} subtitle={`${invoices.length} Rechnungen (brutto)`} />
              <KpiCard title="Bereits bezahlt" value={formatCurrency(totalPaid)} subtitle={`${paidCount} Rechnungen vollständig bezahlt`} variant="success" />
              <KpiCard title="Offene Forderungen" value={formatCurrency(totalOpen)} subtitle="Fakturiert minus bezahlt (brutto)" variant="warning" />
              <KpiCard title="Überfällig" value={formatCurrency(totalOverdue)} subtitle="Offen & Fälligkeit überschritten" variant="danger" />
              <KpiCard title="Kritische Fälle" value={criticalCount} subtitle="> 30 Tage überfällig" variant={criticalCount > 0 ? 'danger' : 'default'} />
            </div>
            <DataTable columns={columns} data={invoices} />
          </>
        )}
      </div>
    </div>
  );
}