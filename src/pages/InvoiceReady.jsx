import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, ExternalLink } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import KpiCard from '@/components/shared/KpiCard';
import FilterBar from '@/components/shared/FilterBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency, getMonthLabel, MONTHS_2026 } from '@/lib/liquidityUtils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';

const READINESS_LABELS = {
  not_ready:   { label: 'Nicht bereit',    color: 'bg-gray-100 text-gray-600' },
  in_progress: { label: 'In Bearbeitung',  color: 'bg-blue-100 text-blue-700' },
  ready:       { label: 'Abrechnungsbereit', color: 'bg-emerald-100 text-emerald-700' },
  invoiced:    { label: 'Verrechnet',      color: 'bg-purple-100 text-purple-700' },
  paid:        { label: 'Bezahlt',         color: 'bg-teal-100 text-teal-700' },
};

const CURRENT_MONTH = '2026-05';

export default function InvoiceReady() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ billing_month: '', status: '' });

  const { data: blocks = [], isLoading: b1 } = useQuery({
    queryKey: ['billingBlocks'], queryFn: () => base44.entities.ProjectBillingBlock.list()
  });
  const { data: projects = [], isLoading: b2 } = useQuery({
    queryKey: ['projects'], queryFn: () => base44.entities.LiquidityProject.list()
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProjectBillingBlock.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['billingBlocks'] })
  });

  const isLoading = b1 || b2;

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));

  const enriched = blocks.map(b => ({ ...b, project: projectMap[b.project_id] }));

  const filtered = enriched.filter(b => {
    if (filters.billing_month && b.billing_month !== filters.billing_month) return false;
    if (filters.status && b.invoice_readiness_status !== filters.status) return false;
    return true;
  });

  const readyNow = filtered.filter(b => b.invoice_readiness_status === 'ready' && b.billing_month === CURRENT_MONTH);
  const readyAll = filtered.filter(b => b.invoice_readiness_status === 'ready');
  const inProgress = filtered.filter(b => b.invoice_readiness_status === 'in_progress');

  const readyAmount = readyAll.reduce((s, b) => s + (Number(b.amount_net) || 0), 0);
  const readyNowAmount = readyNow.reduce((s, b) => s + (Number(b.amount_net) || 0), 0);
  const inProgressAmount = inProgress.reduce((s, b) => s + (Number(b.amount_net) || 0), 0);

  const MONTH_OPTIONS = MONTHS_2026.map(m => ({ value: m, label: getMonthLabel(m) }));
  const STATUS_OPTIONS = Object.entries(READINESS_LABELS).map(([v, { label }]) => ({ value: v, label }));

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-3 gap-4">{Array(3).fill(0).map((_,i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-64" />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Abrechenbar Jetzt" subtitle="Abrechnungsbereit nach Paketen" icon={CheckSquare} />

      <Alert className="border-emerald-200 bg-emerald-50">
        <Info className="w-4 h-4 text-emerald-600" />
        <AlertDescription className="text-emerald-800 text-xs">
          Diese Ansicht zeigt alle <strong>Abrechnungspakete</strong> aus Projekten. Status kann direkt hier geändert werden.
          Um Pakete hinzuzufügen, öffne das jeweilige Projekt.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard title="Bereit – dieser Monat" value={formatCurrency(readyNowAmount)}
          subtitle={`${readyNow.length} Paket(e) – ${getMonthLabel(CURRENT_MONTH)}`} variant={readyNowAmount > 0 ? 'success' : 'default'} />
        <KpiCard title="Bereit gesamt" value={formatCurrency(readyAmount)}
          subtitle={`${readyAll.length} Paket(e)`} variant="warning" />
        <KpiCard title="In Bearbeitung" value={formatCurrency(inProgressAmount)}
          subtitle={`${inProgress.length} Paket(e)`} variant="info" />
      </div>

      <FilterBar
        filters={[
          { key: 'billing_month', label: 'Monat', options: MONTH_OPTIONS },
          { key: 'status', label: 'Status', options: STATUS_OPTIONS },
        ]}
        values={filters}
        onChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))}
        onReset={() => setFilters({ billing_month: '', status: '' })}
      />

      {filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Keine Abrechnungspakete gefunden.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(block => {
            const rl = READINESS_LABELS[block.invoice_readiness_status] || READINESS_LABELS.not_ready;
            return (
              <Card key={block.id} className="hover:shadow-md transition-shadow">
                <CardContent className="py-4 px-5">
                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{block.title}</p>
                        <Badge className={rl.color}>{rl.label}</Badge>
                        {block.billing_month && (
                          <Badge variant="outline" className="text-xs">{getMonthLabel(block.billing_month)}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {block.project?.customer || block.customer} · {block.project?.project_name || block.project_name}
                        {block.responsible_person && ` · ${block.responsible_person}`}
                      </p>
                      {block.notes && <p className="text-xs text-muted-foreground mt-1 italic">{block.notes}</p>}
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="font-bold text-base">{formatCurrency(block.amount_net)}</p>
                        {block.probability_percent < 100 && (
                          <p className="text-xs text-muted-foreground">{block.probability_percent}% Wahrsch.</p>
                        )}
                      </div>

                      <Select
                        value={block.invoice_readiness_status || 'not_ready'}
                        onValueChange={v => updateMutation.mutate({ id: block.id, data: { invoice_readiness_status: v } })}
                      >
                        <SelectTrigger className="w-40 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(READINESS_LABELS).map(([v, { label }]) => (
                            <SelectItem key={v} value={v} className="text-xs">{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Button variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => navigate(`/projects/${block.project_id}`)}>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}