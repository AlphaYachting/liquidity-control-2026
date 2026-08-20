import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import TypPill from '@/components/sprint/TypPill';
import SectionLabel from '@/components/sprint/SectionLabel';
import ProjektBeschreibung from '@/components/sprint/uebersicht/ProjektBeschreibung';
import AworkVerlaufPanel from '@/components/sprint/uebersicht/AworkVerlaufPanel';
import { fmtEUR } from '@/components/sprint/sprintConfig';

const h1 = (v) => (v || 0).toLocaleString('de-AT', { maximumFractionDigits: 1 });

// Projekt-Übersicht über den Etappen: Briefing, Zuständigkeit, Plan gegen Ist, Auftrag, aWork-Verlauf
export default function ProjektUebersicht({ project, client, sprint, timeEntries, onChanged }) {
  const { data: order } = useQuery({
    queryKey: ['projectOrder', project?.id],
    enabled: Boolean(project?.id),
    queryFn: async () => {
      const rows = await base44.entities.ConfirmedOrder.filter({ project_id: project.id }, '-confirmation_date', 5);
      return rows[0] || null;
    },
  });

  if (!project) return null;

  const plan = project.target_hours || sprint?.target_hours || 0;
  const ist = (timeEntries || []).reduce((s, t) => s + (t.hours || 0), 0);
  const pct = plan > 0 ? Math.min(100, Math.round((ist / plan) * 100)) : 0;

  return (
    <div>
      <SectionLabel className="mb-2">Projekt-Übersicht</SectionLabel>
      <div className="bg-white rounded-lg border border-border p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <TypPill project={project} />
            <span className="text-sm font-semibold">{client?.name || 'Kunde nicht verknüpft'}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Projektmanagement: <span className="font-medium text-foreground">{project.pm_email || '—'}</span>
          </div>
          {order && (
            <div className="text-xs text-muted-foreground">
              Auftrag {order.order_number || '—'}:{' '}
              <span className="font-medium text-foreground">{fmtEUR(order.total_net_amount)} netto</span>
            </div>
          )}
        </div>

        <ProjektBeschreibung project={project} onSaved={onChanged} />

        <div className="max-w-sm">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">Stunden</span>
            <span className="font-semibold">{h1(ist)} von {h1(plan)} h</span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-foreground" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <AworkVerlaufPanel clientName={client?.name} projectTitle={project.title} />
      </div>
    </div>
  );
}