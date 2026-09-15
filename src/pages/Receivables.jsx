import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import FilterBar from '@/components/shared/FilterBar';
import DataTable from '@/components/shared/DataTable';
import DunningSection from '@/components/receivables/DunningSection';
import ReceivableActions from '@/components/receivables/ReceivableActions';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatCurrency, calcOverdueDays, getAgingBucket, AGING_LABELS } from '@/lib/liquidityUtils';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

export default function Receivables() {
  const [filters, setFilters] = useState({});
  const [alleAnzeigen, setAlleAnzeigen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Standard: nur Forderungen mit Rechnungsdatum ab 24.07.2026
  const STICHTAG = '2026-07-24';

  // Live-Forderungen direkt aus sevDesk (offen + teilbezahlt)
  const { data: liveData, isLoading } = useQuery({
    queryKey: ['sevdeskReceivablesLive'],
    queryFn: async () => (await base44.functions.invoke('fetchSevdeskReceivablesLive', {})).data,
    staleTime: 5 * 60 * 1000,
  });

  const { data: dunningRecords = [] } = useQuery({
    queryKey: ['dunningRecords'],
    queryFn: () => base44.entities.DunningRecord.list('-created_date', 500),
  });

  // Höchste aktive Mahnstufe pro sevDesk-Rechnung
  // Versendete Mahnungen ('approved') haben Vorrang vor reinen sevDesk-Entwürfen
  const dunningByInvoice = {};
  dunningRecords.forEach(d => {
    if (d.status === 'rejected' || d.status === 'error' || d.status === 'closed_paid' || !d.sevdesk_invoice_id) return;
    const sent = d.status === 'approved';
    const level = d.dunning_level || 0;
    const cur = dunningByInvoice[d.sevdesk_invoice_id];
    if (!cur || (sent && !cur.sent) || (sent === cur.sent && level > cur.level)) {
      dunningByInvoice[d.sevdesk_invoice_id] = {
        level, label: d.level_label || '', sent,
        id: d.id, status: d.status, url: d.sevdesk_reminder_url || '',
      };
    }
  });

  // Mahnentwurf freigeben (versenden) oder verwerfen — direkt aus der Liste
  const decideMutation = useMutation({
    mutationFn: async ({ id, status }) => status === 'rejected'
      ? base44.functions.invoke('rejectDunningDraft', { dunning_record_id: id })
      : base44.functions.invoke('approveDunningDraft', { dunning_record_id: id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dunningRecords'] }),
  });

  const enriched = (liveData?.invoices || []).map(r => ({
    ...r,
    calc_overdue_days: calcOverdueDays(r.due_date),
    aging_bucket: getAgingBucket(calcOverdueDays(r.due_date)),
    dunning_level: dunningByInvoice[r.id]?.level || 0,
    dunning_label: dunningByInvoice[r.id]?.label || '',
    dunning_sent: dunningByInvoice[r.id]?.sent === true,
    dunning_id: dunningByInvoice[r.id]?.id || '',
    dunning_status: dunningByInvoice[r.id]?.status || '',
    dunning_url: dunningByInvoice[r.id]?.url || '',
  }));

  const filtered = enriched.filter(r => {
    if (!alleAnzeigen && (!r.invoice_date || r.invoice_date < STICHTAG)) return false;
    if (filters.status && r.payment_status !== filters.status) return false;
    if (filters.aging && r.aging_bucket !== filters.aging) return false;
    return true;
  });

  const totalOpen = filtered.reduce((s, r) => s + (Number(r.open_amount) || 0), 0);
  const totalOverdue = filtered.filter(r => r.calc_overdue_days > 0).reduce((s, r) => s + (Number(r.open_amount) || 0), 0);
  const criticalCount = filtered.filter(r => r.calc_overdue_days > 30).length;

  const columns = [
    { key: 'payment_status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
    { key: 'customer_name', label: 'Kunde' },
    { key: 'invoice_number', label: 'RE-Nr.' },
    { key: 'invoice_date', label: 'RE-Datum' },
    { key: 'gross_amount', label: 'Brutto', render: (v) => formatCurrency(v), cellClass: 'text-right' },
    { key: 'open_amount', label: 'Offen', render: (v) => formatCurrency(v), cellClass: 'text-right font-medium' },
    { key: 'due_date', label: 'Fällig' },
    {
      key: 'calc_overdue_days',
      label: 'Zahlungsstand',
      render: (v, row) => (Number(row.open_amount) || 0) <= 0.01
        ? <Badge className="bg-emerald-100 text-emerald-700">✓ Bezahlt</Badge>
        : v > 0
          ? <Badge className="bg-red-100 text-red-700">{v} Tage überfällig</Badge>
          : <Badge className="bg-slate-100 text-slate-700">offen, nicht fällig</Badge>,
    },
    {
      key: 'dunning_level',
      label: 'Mahnstand',
      render: (v, row) => {
        if (!(v > 0)) return <span className="text-xs text-muted-foreground">noch nicht gemahnt</span>;
        if (!row.dunning_sent) return <Badge className="bg-slate-100 text-slate-600">Entwurf: {row.dunning_label || `Stufe ${v}`}</Badge>;
        return <Badge className={v >= 2 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}>{row.dunning_label || `Stufe ${v}`} versendet</Badge>;
      },
    },
    {
      key: 'id',
      label: 'Aktion',
      render: (v, row) => (
        <ReceivableActions
          row={row}
          isPending={decideMutation.isPending}
          onDecide={(id, status) => decideMutation.mutate({ id, status })}
        />
      ),
    },
  ];

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-[400px]" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offene Forderungen / Mahnwesen"
        subtitle={`${filtered.length} offene Rechnungen — live aus sevDesk${alleAnzeigen ? '' : ', ab 24.07.2026'}`}
        icon={AlertTriangle}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAlleAnzeigen(a => !a)}
              className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
            >
              {alleAnzeigen ? 'Nur ab 24.07.2026' : 'Alle Forderungen anzeigen'}
            </button>
            <button
              onClick={() => navigate('/payment-consistency')}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Konsistenzprüfung
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Offene Forderungen" value={formatCurrency(totalOpen)} subtitle="Summe offener Beträge (brutto)" variant="warning" />
        <KpiCard title="Überfällig" value={formatCurrency(totalOverdue)} subtitle="Offen & Fälligkeit überschritten" variant="danger" />
        <KpiCard title="Kritische Fälle" value={criticalCount} subtitle="> 30 Tage überfällig" variant={criticalCount > 0 ? 'danger' : 'default'} />
        <KpiCard title="Gesamt Positionen" value={filtered.length} subtitle="Offene Rechnungen in sevDesk" />
      </div>

      <DunningSection />

      <FilterBar
        filters={[
          { key: 'status', label: 'Status', options: [
            { value: 'open', label: 'Offen' },
            { value: 'partially_paid', label: 'Teilbezahlt' },
          ]},
          { key: 'aging', label: 'Alter', options: Object.entries(AGING_LABELS).map(([v, l]) => ({ value: v, label: l })) },
        ]}
        values={filters}
        onChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))}
        onReset={() => setFilters({})}
      />

      {decideMutation.isError && (
        <p className="text-xs text-red-600">
          Fehler: {decideMutation.error?.response?.data?.error || decideMutation.error?.message}
        </p>
      )}

      <DataTable columns={columns} data={filtered} />
    </div>
  );
}