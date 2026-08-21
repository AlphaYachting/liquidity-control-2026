import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/liquidityUtils';

const INTERVAL_LABEL = {
  monthly: 'monatlich',
  quarterly: 'quartalsweise',
  yearly: 'jährlich',
  once: 'einmalig',
  by_effort: 'nach Aufwand',
};

// Verankerung je Arbeitsmodell — reine Anzeige, keine Eingabe.
export default function AbrechnungAnker({ project, milestones = [], tickets = [] }) {
  const modell = project?.abrechnungsmodell || 'sprint';

  const { data: vertrag } = useQuery({
    enabled: Boolean(project?.recurring_contract_id),
    queryKey: ['recurringContract', project?.recurring_contract_id],
    queryFn: () => base44.entities.RecurringContract.get(project.recurring_contract_id).catch(() => null),
  });

  if (modell === 'sprint') {
    const etappen = milestones.filter((m) => Number(m.milestone_amount) > 0);
    if (etappen.length === 0) return null;
    return (
      <div className="bg-card border rounded-xl p-4 space-y-2">
        <h3 className="text-sm font-semibold">Abrechenbare Etappen</h3>
        {etappen.map((m) => (
          <div key={m.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
            <span className="truncate">{m.title}</span>
            <span className="flex items-center gap-2 shrink-0">
              <Badge className={m.released ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}>
                {m.released ? 'freigegeben — fakturierbar' : 'nicht freigegeben'}
              </Badge>
              <span className="font-semibold">{formatCurrency(m.milestone_amount)}</span>
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (modell === 'support' || modell === 'aufwand') {
    const offen = tickets.filter((t) => t.origin === 'change_request' && t.status !== 'erledigt');
    const stunden = offen.reduce((s, t) => s + (Number(t.target_hours) || 0), 0);
    return (
      <div className="bg-card border rounded-xl p-4 space-y-2">
        <h3 className="text-sm font-semibold">Nach Aufwand abrechenbar</h3>
        {offen.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine offenen Change Requests.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {offen.length} offene{offen.length === 1 ? 'r' : ''} Change Request · {stunden.toLocaleString('de-AT', { maximumFractionDigits: 1 })} Planstunden
            </p>
            {offen.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                <span className="truncate">{t.title}</span>
                <Badge className="bg-amber-100 text-amber-700 shrink-0">nach Aufwand</Badge>
              </div>
            ))}
          </>
        )}
        {vertrag && (
          <p className="text-sm pt-1 border-t">
            Vertrag: {formatCurrency(vertrag.monthly_fixed_price)} · {INTERVAL_LABEL[vertrag.billing_interval] || vertrag.billing_interval}
          </p>
        )}
      </div>
    );
  }

  if (vertrag) {
    return (
      <div className="bg-card border rounded-xl p-4 space-y-1">
        <h3 className="text-sm font-semibold">Laufender Vertrag</h3>
        <p className="text-sm">
          {formatCurrency(vertrag.monthly_fixed_price)} · {INTERVAL_LABEL[vertrag.billing_interval] || vertrag.billing_interval}
        </p>
        {vertrag.project_name && <p className="text-xs text-muted-foreground">{vertrag.project_name}</p>}
      </div>
    );
  }

  return null;
}