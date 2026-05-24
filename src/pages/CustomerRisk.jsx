import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Users, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/liquidityUtils';
import { Skeleton } from '@/components/ui/skeleton';
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

  const isLoading = pLoading || iLoading || oLoading;

  const customerData = useMemo(() => {
    if (isLoading) return [];

    // Group projects by customer
    const customerMap = {};
    projects.forEach(p => {
      const key = p.customer || 'Unbekannt';
      if (!customerMap[key]) customerMap[key] = { customer: key, projects: [], totalNet: 0, invoicedNet: 0, openNet: 0, paidGross: 0, hasRisk: false };
      customerMap[key].projects.push(p);
      customerMap[key].totalNet += p.total_net_amount || 0;
      customerMap[key].openNet += p.open_amount || 0;
      if (['high', 'critical'].includes(p.risk_status)) customerMap[key].hasRisk = true;
    });

    // Aggregate invoices per customer
    const customerInvoiceMap = {};
    const projectCustomerMap = {};
    projects.forEach(p => { projectCustomerMap[p.id] = p.customer; });

    const orderProjectMap = {};
    orders.forEach(o => { if (o.id && o.project_id) orderProjectMap[o.id] = o.project_id; });

    invoices.forEach(inv => {
      const pid = inv.project_id || orderProjectMap[inv.confirmed_order_id];
      const cust = pid ? projectCustomerMap[pid] : null;
      if (!cust) return;
      if (!customerInvoiceMap[cust]) customerInvoiceMap[cust] = { total: 0, paid: 0, open: 0, overdue: 0, invoiceList: [] };
      const gross = inv.gross_amount || 0;
      customerInvoiceMap[cust].total += gross;
      if (inv.payment_status === 'paid') customerInvoiceMap[cust].paid += gross;
      else customerInvoiceMap[cust].open += inv.open_amount || gross;
      if (inv.payment_status === 'overdue') customerInvoiceMap[cust].overdue += inv.open_amount || gross;
      customerInvoiceMap[cust].invoiceList.push(inv);
    });

    return Object.values(customerMap)
      .map(c => ({
        ...c,
        invoiceSummary: customerInvoiceMap[c.customer] || { total: 0, paid: 0, open: 0, overdue: 0, invoiceList: [] },
        activeProjects: c.projects.filter(p => p.status === 'active').length,
      }))
      .sort((a, b) => b.totalNet - a.totalNet);
  }, [projects, invoices, orders, isLoading]);

  const totalExposure = customerData.reduce((s, c) => s + c.totalNet, 0);
  const riskCustomers = customerData.filter(c => c.hasRisk || c.invoiceSummary.overdue > 0).length;

  const getRiskBadge = (c) => {
    if (c.hasRisk || c.invoiceSummary.overdue > 0) return { label: 'Risiko', cls: 'bg-red-100 text-red-700 border-red-200' };
    if (c.activeProjects > 2 && c.invoiceSummary.open > 10000) return { label: 'Klumpen', cls: 'bg-amber-100 text-amber-700 border-amber-200' };
    return null;
  };

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kundenrisiko-Aggregation"
        subtitle={`${customerData.length} Kunden · Gesamtexposure ${formatCurrency(totalExposure)} · ${riskCustomers} mit Risikoflag`}
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
                    <span className="text-xs text-muted-foreground">{c.activeProjects} aktive Projekte · {exposurePct}% Exposure</span>
                  </div>

                  {/* Exposure bar */}
                  <div className="mt-2 w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${exposurePct}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 flex-shrink-0 text-right">
                  <div>
                    <p className="text-xs text-muted-foreground">Gesamt</p>
                    <p className="text-sm font-semibold">{formatCurrency(c.totalNet)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Offen</p>
                    <p className={`text-sm font-semibold ${c.openNet > 0 ? 'text-amber-600' : ''}`}>{formatCurrency(c.openNet)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Überfällig</p>
                    <p className={`text-sm font-semibold ${c.invoiceSummary.overdue > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>{formatCurrency(c.invoiceSummary.overdue)}</p>
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="border-t px-4 pb-4 pt-3 space-y-3 bg-muted/20">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-card rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Projekte gesamt</p>
                      <p className="font-bold">{c.projects.length}</p>
                    </div>
                    <div className="bg-card rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Rechnungen total</p>
                      <p className="font-bold">{formatCurrency(c.invoiceSummary.total)}</p>
                    </div>
                    <div className="bg-card rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Bezahlt</p>
                      <p className="font-bold text-emerald-600">{formatCurrency(c.invoiceSummary.paid)}</p>
                    </div>
                    <div className="bg-card rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Offen (Rechnungen)</p>
                      <p className={`font-bold ${c.invoiceSummary.open > 0 ? 'text-amber-600' : ''}`}>{formatCurrency(c.invoiceSummary.open)}</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {c.projects.map(p => {
                      const cleanName = (p.project_name || '').replace(/^(order confirmation|auftragsbestätigung)\s*[|]\s*/i, '').trim();
                      return (
                        <div
                          key={p.id}
                          className="flex items-center justify-between gap-2 bg-card rounded-lg px-3 py-2 cursor-pointer hover:shadow-sm transition-shadow"
                          onClick={() => navigate(`/projects/${p.id}`)}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{cleanName || p.customer}</p>
                            <p className="text-xs text-muted-foreground">{p.status} · {p.project_manager || '–'}</p>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {['high', 'critical'].includes(p.risk_status) && (
                              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                            )}
                            <span className="text-sm font-semibold">{formatCurrency(p.total_net_amount)}</span>
                            <span className="text-xs text-muted-foreground">→</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}