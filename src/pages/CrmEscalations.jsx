import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Siren, CheckCircle2, Loader2 } from 'lucide-react';
import { useEmailEscalations } from '@/hooks/useEmailEscalations';
import EscalationInterventionCard from '@/components/crm/emails/EscalationInterventionCard';

// Eigene Seite für Kunden-Eskalationen aus der E-Mail-Datenbank —
// bewusst getrennt von der E-Mail-Zentrale, damit beide übersichtlich bleiben.
export default function CrmEscalations() {
  const { data: threads = [], isLoading } = useEmailEscalations();
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.LiquidityProject.list(),
  });

  const projectsForCustomer = (customerName) => {
    if (!customerName) return [];
    const norm = customerName.toLowerCase();
    return projects.filter((p) => {
      const c = (p.customer || '').toLowerCase();
      return c && (c.includes(norm) || norm.includes(c.split(' ')[0]));
    });
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Siren className="w-5 h-5 text-red-600" /> Kunden-Eskalationen
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          E-Mail-Verläufe mit Reklamationen oder kritischer Stimmung, die sofortiges Handeln erfordern.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-12 justify-center text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Eskalationen werden geladen…
        </div>
      ) : threads.length === 0 ? (
        <div className="border rounded-xl bg-card p-10 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
          <p className="text-sm font-medium">Keine offenen Kunden-Eskalationen</p>
          <p className="text-xs text-muted-foreground mt-1">Alle kritischen Verläufe sind bearbeitet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {threads.map((t) => (
            <EscalationInterventionCard key={t.id} thread={t} linkedProjects={projectsForCustomer(t.customer_label)} />
          ))}
        </div>
      )}
    </div>
  );
}