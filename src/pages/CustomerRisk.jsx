import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Users, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/lib/liquidityUtils';
import { Skeleton } from '@/components/ui/skeleton';
import { calculateProjectFinancials } from '@/lib/projectFinancials';
import { useNavigate } from 'react-router-dom';

export default function CustomerRisk() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState({});

  const { data: projects = [], isLoading: pLoading } = useQuery({
    queryKey: ['projects'], queryFn: () => base44.entities.LiquidityProject.list()
  });
  const { data: invoices = [], isLoading: iLoading } = useQuery({
    queryKey: ['invoiceRecords'], queryFn: () => base44.entities.InvoiceRecord.list()
  });
  const { data: orders = [], isLoading: oLoading } = useQuery({
    queryKey: ['confirmedOrders'], queryFn: () => base44.entities.ConfirmedOrder.list()
  });
  const { data: allBlocks = [], isLoading: bLoading } = useQuery({
    queryKey: ['billingBlocks'], queryFn: () => base44.entities.ProjectBillingBlock.list()
  });

  const isLoading = pLoading || iLoading || oLoading || bLoading;

  // Pre-compute financials per project using the shared helper (same as Projects page)
  const finMap = useMemo(() => {
    if (isLoading) return {};
    const map = {};
    projects.forEach(p => {
      map[p.id] = calculateProjectFinancials({ project: p, allOrders: orders, allBlocks, allInvoices: invoices });
    });
    return map;
  }, [projects, orders, allBlocks, invoices, isLoading]);

  const customerData = useMemo(() => {
    if (isLoading) return [];

    // Group projects by customer
    const customerMap = {};
    projects.forEach(p => {
      const key = p.customer || 'Unbekannt';
      if (!customerMap[key]) {
        customerMap[key] = {
          customer: key,
          projects: [],
          totalNet: 0,
          openToInvoiceNet: 0,
          openReceivableGross: 0,
          paidGross: 0,
          invoicedNet: 0,
          overdue: 0,
          hasRisk: false,
          linkedInvoices: [],
        };
      }
      const c = customerMap[key];
      const fin = finMap[p.id] || {};

      c.projects.push(p);
      // Use project's total_net_amount as the order volume basis
      c.totalNet += Number(p.total_net_amount) || 0;
      // Use calculated financials for billing accuracy
      c.openToInvoiceNet += fin.openToInvoiceNet ?? 0;
      c.openReceivableGross += fin.openReceivableGross ?? 0;
      c.paidGross += fin.paidGross ?? 0;
      c.invoicedNet += fin.adjustedInvoicedNet ?? 0;

      // Overdue: sum open_amount of invoices with status overdue or partially_paid past due
      const today = new Date().toISOString().slice(0, 10);
      (fin.linkedInvoices || []).forEach(inv => {
        if (inv.is_credit_note || inv.payment_status === 'cancelled' || inv.payment_status === 'paid') return;
        const isOverdue = inv.payment_status === 'overdue' ||
          (inv.due_date && inv.due_date < today && ['open', 'partially_paid'].includes(inv.payment_status));
        if (isOverdue) {
          c.overdue += Number(inv.open_amount) || Number(inv.gross_amount) || 0;
        }
        // Collect for invoice list display
        if (!c.linkedInvoices.find(i => i.id === inv.id)) {
          c.linkedInvoices.push(inv);
        }
      });

      if (['high', 'critical'].includes(p.risk_status)) c.hasRisk = true;
    });

    return Object.values(customerMap)
      .map(c => ({
        ...c,
        activeProjects: c.projects.filter(p => p.status === 'active').length,
        // filter archived/not-billing-relevant projects for active count only
        billingRelevantProjects: c.projects.filter(p =>
          !['archived', 'not_billing_relevant'].includes(p.billing_relevance_status) &&
          !p.excluded_from_project_cockpit
        ).length,
      }))
      .filter(c => c.billingRelevantProjects > 0 || c.totalNet > 0)
      .sort((a, b) => b.totalNet - a.totalNet);
  }, [projects, finMap, isLoading]);

  const totalExposure = customerData.reduce((s, c) => s + c.totalNet, 0);
  const riskCustomers = customerData.filter(c => c.hasRisk || c.overdue > 0).length;

  const getRiskBadge = (c) => {
    if (c.hasRisk && c.overdue > 0) return { label: 'Risiko + Überfällig', cls: 'bg-red-100 text-red-700 border-red-200' };
    if (c.hasRisk) return { label: 'Risikoprojekt', cls: 'bg-orange-100 text-orange-700 border-orange-200' };
    if (c.overdue > 0) return { label: 'Überfällig', cls: 'bg-red-100 text-red-700 border-red-200' };
    if (c.billingRelevantProjects > 2 && c.openReceivableGross > 20000) return { label: 'Klumpenrisiko', cls: 'bg-amber-100 text-amber-700 border-amber-200' };
    return null;
  };

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kundenrisiko-Aggregation"
        subtitle={`${customerData.length} Kunden · Gesamtvolumen ${formatCurrency(totalExposure)} · ${riskCustomers} mit Risikoflag`}
        icon={Users}
      />

      <div className="space-y-3">
        {customerData.map((c, idx) => {
          const isOpen = expanded[c.customer];
          const riskBadge = getRiskBadge(c);
          const exposurePct = totalExposure > 0 ? ((c.totalNet / totalExposure) * 100).toFixed(1) : 0;

          return (
            <Card key={idx} className="overflow-hidden">
              <button
                className="w-full p-4 flex items-center gap-4 text-left hover:bg-muted/30 transition-colors"
                onClick={() => setExpanded(e => ({ ...e, [c.customer]: !e[c.customer] }))}
              >
                {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{c.customer}</span>
                    {riskBadge && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${riskBadge.cls}`}>
                        {riskBadge.label}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {c.activeProjects} aktive · {c.projects.length} Projekte gesamt · {exposurePct}% Exposure
                    </span>
                  </div>
                  <div className="mt-2 w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, exposurePct)}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4 flex-shrink-0 text-right">
                  <div>
                    <p className="text-xs text-muted-foreground">Volumen netto</p>
                    <p className="text-sm font-semibold">{formatCurrency(c.totalNet)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Noch zu verr.</p>
                    <p className={`text-sm font-semibold ${c.openToInvoiceNet > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {formatCurrency(Math.max(0, c.openToInvoiceNet))}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Offen (Forder.)</p>
                    <p className={`text-sm font-semibold ${c.openReceivableGross > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                      {formatCurrency(c.openReceivableGross)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Überfällig</p>
                    <p className={`text-sm font-semibold ${c.overdue > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                      {c.overdue > 0 ? formatCurrency(c.overdue) : '—'}
                    </p>
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="border-t px-4 pb-4 pt-3 space-y-4 bg-muted/20">
                  {/* Summary KPIs */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-card rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Verrechnet netto</p>
                      <p className="font-bold">{formatCurrency(c.invoicedNet)}</p>
                    </div>
                    <div className="bg-card rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Bezahlt brutto</p>
                      <p className="font-bold text-emerald-600">{formatCurrency(c.paidGross)}</p>
                    </div>
                    <div className="bg-card rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Offene Forderungen</p>
                      <p className={`font-bold ${c.openReceivableGross > 0 ? 'text-amber-600' : ''}`}>{formatCurrency(c.openReceivableGross)}</p>
                    </div>
                    <div className="bg-card rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Noch zu verrechnen</p>
                      <p className={`font-bold ${c.openToInvoiceNet > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {formatCurrency(Math.max(0, c.openToInvoiceNet))}
                      </p>
                    </div>
                  </div>

                  {/* Project list */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Projekte</p>
                    {c.projects.map(p => {
                      const fin = finMap[p.id] || {};
                      const cleanName = (p.project_name || '').replace(/^(order confirmation|auftragsbestätigung)\s*[|]\s*/i, '').trim();
                      const isArchived = ['archived', 'not_billing_relevant'].includes(p.billing_relevance_status);
                      return (
                        <div
                          key={p.id}
                          className={`flex items-center justify-between gap-2 bg-card rounded-lg px-3 py-2 cursor-pointer hover:shadow-sm transition-shadow ${isArchived ? 'opacity-50' : ''}`}
                          onClick={() => navigate(`/projects/${p.id}`)}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{cleanName || p.customer}</p>
                            <p className="text-xs text-muted-foreground">
                              {p.status} · {p.project_manager || '–'}
                              {isArchived && ' · archiviert'}
                            </p>
                          </div>
                          <div className="flex items-center gap-4 flex-shrink-0 text-right">
                            {['high', 'critical'].includes(p.risk_status) && (
                              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                            )}
                            <div>
                              <p className="text-xs text-muted-foreground">Volumen</p>
                              <p className="text-sm font-semibold">{formatCurrency(p.total_net_amount)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Noch offen</p>
                              <p className={`text-sm font-semibold ${(fin.openToInvoiceNet || 0) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {formatCurrency(Math.max(0, fin.openToInvoiceNet || 0))}
                              </p>
                            </div>
                            <span className="text-xs text-muted-foreground">→</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Overdue invoices */}
                  {c.overdue > 0 && (() => {
                    const today = new Date().toISOString().slice(0, 10);
                    const overdueInvs = c.linkedInvoices.filter(inv => {
                      if (inv.is_credit_note || inv.payment_status === 'cancelled' || inv.payment_status === 'paid') return false;
                      return inv.payment_status === 'overdue' ||
                        (inv.due_date && inv.due_date < today && ['open', 'partially_paid'].includes(inv.payment_status));
                    });
                    if (!overdueInvs.length) return null;
                    return (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-red-600 uppercase tracking-wide">Überfällige Rechnungen</p>
                        {overdueInvs.map(inv => (
                          <div key={inv.id} className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                            <div>
                              <p className="text-sm font-medium">{inv.invoice_number || '—'}</p>
                              <p className="text-xs text-muted-foreground">Fällig: {inv.due_date || '—'}</p>
                            </div>
                            <p className="text-sm font-semibold text-red-600">
                              {formatCurrency(inv.open_amount || inv.gross_amount)}
                            </p>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}