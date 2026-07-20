import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Landmark } from 'lucide-react';
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
    <div className="border rounded-xl bg-card p-4 space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-1.5">
        <Landmark className="w-3.5 h-3.5 text-primary" /> Kunden-Kontext
      </h3>
      <div className="text-xs space-y-1.5">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Aktive Projekte</span>
          <span className="font-semibold">{projects.length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Offene Forderungen</span>
          <span className={`font-semibold ${openSum > 0 ? 'text-amber-600' : ''}`}>{eur(openSum)}</span>
        </div>
        {overdueCount > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Davon überfällig</span>
            <span className="font-semibold text-red-600">{overdueCount} Rechnung(en)</span>
          </div>
        )}
      </div>
      {projects.length > 0 && (
        <div className="pt-2 border-t space-y-1">
          {projects.slice(0, 4).map(p => (
            <p key={p.id} className="text-xs text-muted-foreground truncate">• {p.project_name}</p>
          ))}
        </div>
      )}
      {overdueCount > 0 && (
        <p className="text-[11px] rounded-md bg-red-50 text-red-700 px-2 py-1.5 font-medium">
          ⚠️ Vor neuem Angebot: offene Forderungen ansprechen
        </p>
      )}
    </div>
  );
}