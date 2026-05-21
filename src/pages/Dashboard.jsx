import React, { useState, useMemo } from 'react';
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

  const isLoading = pLoading || lLoading;

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
      <DashboardKpis projects={projects} planLines={planLines} contracts={contracts} tools={tools} receivables={receivables} payables={payables} />
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