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
import LiquidityTrendChart from '@/components/dashboard/LiquidityTrendChart';
import NonBillableWidget from '@/components/dashboard/NonBillableWidget';
import CashflowForecastChart from '@/components/dashboard/CashflowForecastChart';
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

  // Live-Berechnung: konsistent mit calculateProjectFinancials() —
  // Rechnungen werden über project_id, confirmed_order_id (via AB), billing_block_id und order_number zugeordnet.
  const { data: allOrders = [] } = useQuery({
    queryKey: ['confirmedOrders'], queryFn: () => base44.entities.ConfirmedOrder.list()
  });
  const { data: allBlocks = [] } = useQuery({
    queryKey: ['billingBlocks'], queryFn: () => base44.entities.ProjectBillingBlock.list()
  });
  const { data: billingInstructions = [] } = useQuery({
    queryKey: ['billingInstructions'], queryFn: () => base44.entities.BillingInstruction.list()
  });


  const { liveInvoiced, liveOpen } = useMemo(() => {
    let liveInvoiced = 0;
    let liveOpen = 0;

    projects.forEach(p => {
      const projectId = p.id;
      const customerKey = (p.customer || '').toLowerCase();

      const linkedOrders = allOrders.filter(o => o.project_id === projectId);
      const linkedOrderIds = new Set(linkedOrders.map(o => o.id));
      const linkedOrderNumbers = new Set(
        linkedOrders.map(o => (o.order_number || '').toLowerCase()).filter(Boolean)
      );
      const linkedBlocks = allBlocks.filter(b =>
        b.project_id === projectId ||
        (b.confirmed_order_id && linkedOrderIds.has(b.confirmed_order_id))
      );
      const linkedBlockIds = new Set(linkedBlocks.map(b => b.id));

      const linkedInvoices = invoices.filter(i => {
        if (i.payment_status === 'cancelled') return false;
        if (i.project_id === projectId) return true;
        if (i.confirmed_order_id && linkedOrderIds.has(i.confirmed_order_id)) return true;
        if (i.billing_block_id && linkedBlockIds.has(i.billing_block_id)) return true;
        if (i.order_number && linkedOrderNumbers.has((i.order_number || '').toLowerCase())) return true;
        return false;
      });

      const realInvoices = linkedInvoices.filter(i => !i.is_credit_note);
      const creditNotes = linkedInvoices.filter(i => i.is_credit_note);
      const invoicedNet = realInvoices.reduce((s, i) => s + (Number(i.net_amount) || 0), 0);
      const creditNoteNet = creditNotes.reduce((s, i) => s + (Number(i.net_amount) || 0), 0);
      const adjustedInvoicedNet = invoicedNet - creditNoteNet;

      // Commercial base: orders > blocks > project field (same priority as calculateProjectFinancials)
      const ordersTotalNet = linkedOrders.reduce((s, o) => s + (Number(o.total_net_amount) || 0), 0);
      const blocksTotalNet = linkedBlocks.reduce((s, b) => s + (Number(b.amount_net) || 0), 0);
      const projectTotalNet = Number(p.total_net_amount) || 0;
      const commercialBaseNet = ordersTotalNet > 0 ? ordersTotalNet : blocksTotalNet > 0 ? blocksTotalNet : projectTotalNet;

      liveInvoiced += adjustedInvoicedNet;
      liveOpen += Math.max(0, commercialBaseNet - adjustedInvoicedNet);
    });

    return { liveInvoiced, liveOpen };
  }, [projects, invoices, allOrders, allBlocks]);

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
      <DashboardKpis projects={projects} planLines={planLines} contracts={contracts} tools={tools} receivables={receivables} payables={payables} invoices={invoices} liveInvoiced={liveInvoiced} liveOpen={liveOpen} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CashflowChart planLines={planLines} blocks={allBlocks} contracts={contracts} payables={payables} instructions={billingInstructions} />
        <PipelineChart projects={projects} contracts={contracts} planLines={planLines} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AgingChart receivables={receivables} />
        <ToolCostChart tools={tools} />
      </div>
      <CashflowForecastChart invoiceRecords={invoices} receivables={receivables} />
      <NonBillableWidget />
      <LiquidityTrendChart orders={allOrders} blocks={allBlocks} invoices={invoices} />
      <RiskTimeline planLines={planLines} />
    </div>
  );
}