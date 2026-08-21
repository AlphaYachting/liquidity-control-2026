import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/ui/skeleton';
import ConfirmedOrderPanel from '@/components/projects/ConfirmedOrderPanel';
import OrderItemsView from '@/components/projects/OrderItemsView';
import BillingInstructionList from '@/components/billing/BillingInstructionList';
import InvoicingTimeline from '@/components/projects/InvoicingTimeline';
import BillingProgressBar from '@/components/projects/BillingProgressBar';
import AbrechnungAnker from '@/components/sprint/abrechnung/AbrechnungAnker';
import { formatCurrency } from '@/lib/liquidityUtils';

// Abrechnung eines Projekts: Auftrag, Anweisungen, ausgestellte Rechnungen.
// sevDesk bleibt Ausstellungssystem — hier wird nur angestoßen und abgeglichen.
export default function AbrechnungSektion({ project, milestones = [], tickets = [] }) {
  const queryClient = useQueryClient();
  const projectId = project?.id;

  const { data, isLoading } = useQuery({
    enabled: Boolean(projectId),
    queryKey: ['projektAbrechnung', projectId],
    queryFn: async () => {
      const [orders, instructions, invoices] = await Promise.all([
        base44.entities.ConfirmedOrder.filter({ project_id: projectId }, '-confirmation_date', 50),
        base44.entities.BillingInstruction.filter({ project_id: projectId }, '-created_date', 100),
        base44.entities.InvoiceRecord.filter({ project_id: projectId }, '-invoice_date', 200),
      ]);
      return { orders, instructions, invoices };
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['projektAbrechnung', projectId] });

  if (!projectId) return null;
  if (isLoading || !data) return <Skeleton className="h-32 w-full bg-muted" />;

  const { orders, instructions, invoices } = data;
  const auftragswert = orders.reduce((s, o) => s + (Number(o.total_net_amount) || 0), 0);
  const verrechnet = invoices
    .filter((i) => !i.is_credit_note)
    .reduce((s, i) => s + (Number(i.net_amount) || 0), 0);
  const pct = auftragswert > 0 ? (verrechnet / auftragswert) * 100 : 0;

  if (orders.length === 0 && instructions.length === 0 && invoices.length === 0) {
    return (
      <div className="bg-card border rounded-xl p-6 text-center text-sm text-muted-foreground">
        Noch keine Abrechnung verknüpft.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {auftragswert > 0 && (
        <div className="bg-card border rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Verrechnet gegen Auftragswert</span>
            <span className="font-semibold">
              {formatCurrency(verrechnet)} von {formatCurrency(auftragswert)}
            </span>
          </div>
          <BillingProgressBar billingPct={pct} performancePct={0} size="md" />
        </div>
      )}

      <AbrechnungAnker project={project} milestones={milestones} tickets={tickets} />

      {orders.map((order) => (
        <ConfirmedOrderPanel key={order.id} projectId={projectId} order={order} project={project} />
      ))}
      {orders.length > 0 && <OrderItemsView linkedOrders={orders} />}

      {instructions.length > 0 && (
        <BillingInstructionList
          instructions={instructions}
          projectBlocks={[]}
          onUpdate={async (id, patch) => {
            await base44.entities.BillingInstruction.update(id, patch);
            invalidate();
          }}
          onDelete={async (id) => {
            await base44.entities.BillingInstruction.delete(id);
            invalidate();
          }}
          onDuplicate={async (instr) => {
            const { id, created_date, updated_date, created_by_id, ...rest } = instr;
            await base44.entities.BillingInstruction.create({ ...rest, status: 'draft' });
            invalidate();
          }}
        />
      )}

      <InvoicingTimeline projectInvoices={invoices} />
    </div>
  );
}