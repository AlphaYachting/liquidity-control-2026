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
    queryKey: ['invoices'], queryFn: () => base44.entities.InvoiceRecord.list('-invoice_date', 500)
  });
  const { data: liveReceivables, isLoading: lrLoading } = useQuery({
    queryKey: ['liveReceivables'],
    queryFn: () => base44.functions.invoke('fetchSevdeskReceivablesLive', {}),
    staleTime: 5 * 60 * 1000, // 5 Minuten Cache
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
    if (!projects.length) return { liveInvoiced: 0, liveOpen: 0 };

    // Build lookup maps once — O(n) instead of O(n²)
    const ordersByProjectId = {};
    allOrders.forEach(o => {
      if (!ordersByProjectId[o.project_id]) ordersByProjectId[o.project_id] = [];
      ordersByProjectId[o.project_id].push(o);
    });

    const blocksByProjectId = {};
    const blocksByOrderId = {};
    allBlocks.forEach(b => {
      if (b.project_id) {
        if (!blocksByProjectId[b.project_id]) blocksByProjectId[b.project_id] = [];
        blocksByProjectId[b.project_id].push(b);
      }
      if (b.confirmed_order_id) {
        if (!blocksByOrderId[b.confirmed_order_id]) blocksByOrderId[b.confirmed_order_id] = [];
        blocksByOrderId[b.confirmed_order_id].push(b);
      }
    });

    const invoicesByProjectId = {};
    const invoicesByOrderId = {};
    const invoicesByBlockId = {};
    const invoicesByOrderNumber = {};
    invoices.forEach(i => {
      if (i.payment_status === 'cancelled') return;
      if (i.project_id) {
        if (!invoicesByProjectId[i.project_id]) invoicesByProjectId[i.project_id] = [];
        invoicesByProjectId[i.project_id].push(i);
      }
      if (i.confirmed_order_id) {
        if (!invoicesByOrderId[i.confirmed_order_id]) invoicesByOrderId[i.confirmed_order_id] = [];
        invoicesByOrderId[i.confirmed_order_id].push(i);
      }
      if (i.billing_block_id) {
        if (!invoicesByBlockId[i.billing_block_id]) invoicesByBlockId[i.billing_block_id] = [];
        invoicesByBlockId[i.billing_block_id].push(i);
      }
      if (i.order_number) {
        const key = i.order_number.toLowerCase();
        if (!invoicesByOrderNumber[key]) invoicesByOrderNumber[key] = [];
        invoicesByOrderNumber[key].push(i);
      }
    });

    let liveInvoiced = 0;
    let liveOpen = 0;

    projects.forEach(p => {
      const projectId = p.id;
      const linkedOrders = ordersByProjectId[projectId] || [];
      const linkedOrderIds = new Set(linkedOrders.map(o => o.id));

      const linkedBlocks = [...(blocksByProjectId[projectId] || [])];
      linkedOrders.forEach(o => {
        (blocksByOrderId[o.id] || []).forEach(b => {
          if (!linkedBlocks.find(x => x.id === b.id)) linkedBlocks.push(b);
        });
      });
      const linkedBlockIds = new Set(linkedBlocks.map(b => b.id));

      // Collect invoices via all lookup paths, deduplicating by id
      const seen = new Set();
      const linkedInvoices = [];
      const addInv = (arr) => arr?.forEach(i => { if (!seen.has(i.id)) { seen.add(i.id); linkedInvoices.push(i); } });

      addInv(invoicesByProjectId[projectId]);
      linkedOrderIds.forEach(oid => addInv(invoicesByOrderId[oid]));
      linkedBlockIds.forEach(bid => addInv(invoicesByBlockId[bid]));
      linkedOrders.forEach(o => {
        if (o.order_number) addInv(invoicesByOrderNumber[o.order_number.toLowerCase()]);
      });

      const invoicedNet = linkedInvoices.filter(i => !i.is_credit_note).reduce((s, i) => s + (Number(i.net_amount) || 0), 0);
      const creditNoteNet = linkedInvoices.filter(i => i.is_credit_note).reduce((s, i) => s + (Number(i.net_amount) || 0), 0);
      const adjustedInvoicedNet = invoicedNet - creditNoteNet;

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

  // Live sevDesk Forderungen — direkt aus der API für maximale Genauigkeit
  const liveReceivablesData = liveReceivables?.data || null;

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
      <DashboardKpis projects={projects} planLines={planLines} contracts={contracts} tools={tools} receivables={receivables} payables={payables} invoices={invoices} liveInvoiced={liveInvoiced} liveOpen={liveOpen} liveReceivablesData={liveReceivablesData} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CashflowChart planLines={planLines} blocks={allBlocks} contracts={contracts} payables={payables} instructions={billingInstructions} invoiceRecords={invoices} />
        <PipelineChart projects={projects} contracts={contracts} planLines={planLines} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AgingChart receivables={receivables} />
        <ToolCostChart tools={tools} />
      </div>
      <CashflowForecastChart invoiceRecords={invoices} billingBlocks={allBlocks} />
      <NonBillableWidget />
      <LiquidityTrendChart orders={allOrders} blocks={allBlocks} invoices={invoices} contracts={contracts} />
      <RiskTimeline planLines={planLines} />
    </div>
  );
}