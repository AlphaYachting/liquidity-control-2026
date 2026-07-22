import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Siren } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import { useEmailEscalations } from '@/hooks/useEmailEscalations';
import EscalationInterventionCard from '@/components/crm/emails/EscalationInterventionCard';
import { Skeleton } from '@/components/ui/skeleton';

// Kommunikations-Alerts: KI-erkannte Kunden-Eskalationen mit Einschreitungsvorschlägen.
export default function CrmCommunicationAlerts() {
  const { data: threads = [], isLoading, isError } = useEmailEscalations();
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.LiquidityProject.list(),
  });

  // Projekte dem eskalierten Kunden zuordnen (Namensvergleich, rein lesend)
  const projectsForCustomer = (customerName) => {
    if (!customerName) return [];
    const norm = customerName.toLowerCase();
    return projects.filter((p) => {
      const c = (p.customer || '').toLowerCase();
      return c && (c.includes(norm) || norm.includes(c.split(' ')[0]) || c.split(' ')[0].length >= 3 && norm.includes(c.split(' ')[0]));
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kommunikations-Alerts"
        subtitle="KI-erkannte Kunden-Eskalationen aus der E-Mail-Analyse — mit Vorschlägen zur Einschreitung"
        icon={Siren}
      />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : isError ? (
        <p className="text-sm text-muted-foreground">E-Mail-Datenbank nicht erreichbar.</p>
      ) : threads.length === 0 ? (
        <div className="border rounded-xl bg-card p-8 text-center">
          <p className="text-sm font-medium">Keine Eskalationen erkannt</p>
          <p className="text-xs text-muted-foreground mt-1">
            Die KI-Analyse hat in den letzten 60 Tagen keine E-Mail-Konversationen mit Eskalationsgefahr gefunden.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {threads.map((t) => (
            <EscalationInterventionCard
              key={t.id}
              thread={t}
              linkedProjects={projectsForCustomer(t.customer_normalized || t.customer)}
            />
          ))}
        </div>
      )}
    </div>
  );
}