import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { LayoutDashboard } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import DashboardKpis from '@/components/dashboard/DashboardKpis';
import CashflowChart from '@/components/dashboard/CashflowChart';
import PipelineChart from '@/components/dashboard/PipelineChart';
import AgingChart from '@/components/dashboard/AgingChart';
import ToolCostChart from '@/components/dashboard/ToolCostChart';
import RiskTimeline from '@/components/dashboard/RiskTimeline';
import { Skeleton } from '@/components/ui/skeleton';

export default function Dashboard() {
  const { data: projects = [], isLoading: pLoading } = useQuery({
    queryKey: ['projects'], queryFn: () => base44.entities.LiquidityProject.list()
  });
  const { data: invoices = [], isLoading: iLoading } = useQuery({
    queryKey: ['invoices'], queryFn: () => base44.entities.InvoiceRecord.list()
  });
  const { data: planLines = [], isLoading: lLoading } = useQuery({
    queryKey: ['planLines'], queryFn: () => base44.entities.LiquidityPlanLine.list()
  });
  const { data: contracts = [] } = useQuery({
    queryKey: ['contracts'], queryFn: () => base44.entities.RecurringContract.list()
  });
  const { data: tools = [] } = useQuery({
    queryKey: ['tools'], queryFn: () => base44.entities.ToolCost.list()
  });
  const { data: receivables = [] } = useQuery({
    queryKey: ['receivables'], queryFn: () => base44.entities.Receivable.list()
  });
  const { data: payables = [] } = useQuery({
    queryKey: ['payables'], queryFn: () => base44.entities.Payable.list()
  });

  // Live-Berechnung: Verrechnet = Summe aller Rechnungen (abzgl. Gutschriften), Offen = Projektvolumen - Verrechnet
  const { liveInvoiced, liveOpen } = useMemo(() => {
    const invoicedByProject = {};
    invoices.forEach(inv => {
      if (!inv.project_id) return;
      const net = Number(inv.net_amount) || 0;
      const sign = inv.is_credit_note ? -1 : 1;
      invoicedByProject[inv.project_id] = (invoicedByProject[inv.project_id] || 0) + sign * net;
    });
    let liveInvoiced = 0;
    let liveOpen = 0;
    projects.forEach(p => {
      const inv = invoicedByProject[p.id] || 0;
      const total = Number(p.total_net_amount) || 0;
      liveInvoiced += inv;
      liveOpen += Math.max(0, total - inv);
    });
    return { liveInvoiced, liveOpen };
  }, [projects, invoices]);

  const isLoading = pLoading || lLoading || iLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" subtitle="Liquiditätsübersicht 2026" icon={LayoutDashboard} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Liquiditätsübersicht 2026" icon={LayoutDashboard} />
      <DashboardKpis projects={projects} planLines={planLines} contracts={contracts} tools={tools} receivables={receivables} payables={payables} liveInvoiced={liveInvoiced} liveOpen={liveOpen} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CashflowChart planLines={planLines} />
        <PipelineChart projects={projects} contracts={contracts} planLines={planLines} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AgingChart receivables={receivables} />
        <ToolCostChart tools={tools} />
      </div>
      <RiskTimeline planLines={planLines} />
    </div>
  );
}