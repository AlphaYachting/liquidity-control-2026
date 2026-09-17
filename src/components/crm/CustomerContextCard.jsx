import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Landmark, AlertTriangle } from 'lucide-react';
import { Box, BoxKopf, BoxInhalt } from '@/components/shared/Box';
import { eur } from '@/components/crm/stages';

// Bestandskunden-Kontext: laufende Projekte + offene Forderungen aus vorhandenen Daten
export default function CustomerContextCard({ customerName }) {
  const { data: projects = [] } = useQuery({
    queryKey: ['crm-ctx-projects', customerName],
    queryFn: () => base44.entities.LiquidityProject.filter({ customer: customerName, is_active_for_billing: true }, '-updated_date', 20),
    enabled: Boolean(customerName),
  });
  const { data: invoices = [] } = useQuery({
    queryKey: ['crm-ctx-invoices', customerName],
    queryFn: () => base44.entities.InvoiceRecord.filter({ customer_name: customerName }, '-invoice_date', 100),
    enabled: Boolean(customerName),
  });

  if (!customerName) return null;

  const openInvoices = invoices.filter(i => ['open', 'partially_paid', 'overdue'].includes(i.payment_status));
  const openSum = openInvoices.reduce((s, i) => s + (i.open_amount || 0), 0);
  const overdueCount = openInvoices.filter(i =>
    i.payment_status === 'overdue' || (i.due_date && new Date(i.due_date) < new Date())).length;

  return (
    <Box>
      <BoxKopf symbol={Landmark} titel="Kunden-Kontext" />
      <BoxInhalt>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="text-body text-muted-foreground">Aktive Projekte</span>
            <span className="text-value tabular-nums">{projects.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-body text-muted-foreground">Offene Forderungen</span>
            <span className="text-value tabular-nums text-foreground">{eur(openSum)}</span>
          </div>
          {overdueCount > 0 && (
            <div className="flex justify-between">
              <span className="text-body text-muted-foreground">Davon überfällig</span>
              <span className="text-value tabular-nums text-status-critical">{overdueCount} Rechnung(en)</span>
            </div>
          )}
        </div>

        {projects.length > 0 && (
          <div className="pt-2 border-t space-y-1">
            {projects.slice(0, 4).map(p => (
              <p key={p.id} className="text-meta text-muted-foreground truncate">• {p.project_name}</p>
            ))}
          </div>
        )}

        {overdueCount > 0 && (
          <div className="rounded-lg bg-status-attention-surface px-3 py-2.5 text-meta text-foreground flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-status-attention" />
            <span>Vor neuem Angebot: offene Forderungen ansprechen</span>
          </div>
        )}
      </BoxInhalt>
    </Box>
  );
}