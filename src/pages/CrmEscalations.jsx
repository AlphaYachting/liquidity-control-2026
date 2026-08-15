import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Siren, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEmailEscalations } from '@/hooks/useEmailEscalations';
import { useCrmEscalationCases, isCaseVisible } from '@/hooks/useCrmEscalationCases';
import EscalationInterventionCard from '@/components/crm/emails/EscalationInterventionCard';

// Eigene Seite für Kunden-Eskalationen aus der E-Mail-Datenbank —
// bewusst getrennt von der E-Mail-Zentrale, damit beide übersichtlich bleiben.
export default function CrmEscalations() {
  const [onlyMine, setOnlyMine] = useState(false);
  const { data: threads = [], isLoading } = useEmailEscalations();
  const { data: cases = [] } = useCrmEscalationCases();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.LiquidityProject.list(),
  });

  const caseByThread = new Map(cases.map((c) => [String(c.thread_id), c]));

  const projectsForCustomer = (customerName) => {
    if (!customerName) return [];
    const norm = customerName.toLowerCase();
    return projects.filter((p) => {
      const c = (p.customer || '').toLowerCase();
      return c && (c.includes(norm) || norm.includes(c.split(' ')[0]));
    });
  };

  const rows = threads
    .map((t) => ({ thread: t, caseRecord: caseByThread.get(String(t.id)) || null }))
    .filter(({ caseRecord }) => isCaseVisible(caseRecord))
    .filter(({ caseRecord }) => !onlyMine || (caseRecord?.assigned_to && caseRecord.assigned_to === me?.email))
    .sort((a, b) => {
      const sev = (b.caseRecord?.severity || 0) - (a.caseRecord?.severity || 0);
      if (sev !== 0) return sev;
      return new Date(a.thread.last_message_at || 0) - new Date(b.thread.last_message_at || 0);
    });

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Siren className="w-5 h-5 text-red-600" /> Kunden-Eskalationen
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            E-Mail-Verläufe mit Reklamationen oder kritischer Stimmung, die sofortiges Handeln erfordern.
          </p>
        </div>
        <Button size="sm" variant={onlyMine ? 'default' : 'outline'} className="h-8 text-xs"
          onClick={() => setOnlyMine((v) => !v)}>
          Nur meine
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-12 justify-center text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Eskalationen werden geladen…
        </div>
      ) : rows.length === 0 ? (
        <div className="border rounded-xl bg-card p-10 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
          <p className="text-sm font-medium">Keine offenen Kunden-Eskalationen</p>
          <p className="text-xs text-muted-foreground mt-1">Alle kritischen Verläufe sind bearbeitet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(({ thread, caseRecord }) => (
            <EscalationInterventionCard
              key={thread.id}
              thread={thread}
              caseRecord={caseRecord}
              linkedProjects={projectsForCustomer(thread.customer_label)}
            />
          ))}
        </div>
      )}
    </div>
  );
}