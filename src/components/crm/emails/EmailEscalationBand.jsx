import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Siren, ChevronDown, ChevronUp } from 'lucide-react';
import { useEmailEscalations } from '@/hooks/useEmailEscalations';
import EscalationInterventionCard from '@/components/crm/emails/EscalationInterventionCard';

// Rotes Eskalationsband ganz oben in der E-Mail-Zentrale — ersetzt die
// eigene Seite "Kommunikations-Alerts".
export default function EmailEscalationBand() {
  const { data: threads = [], isLoading } = useEmailEscalations();
  const [open, setOpen] = useState(true); // liegen Eskalationen vor, sind sie sofort lesbar
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.LiquidityProject.list(),
    enabled: open,
  });

  if (isLoading || threads.length === 0) return null;

  const projectsForCustomer = (customerName) => {
    if (!customerName) return [];
    const norm = customerName.toLowerCase();
    return projects.filter((p) => {
      const c = (p.customer || '').toLowerCase();
      return c && (c.includes(norm) || norm.includes(c.split(' ')[0]));
    });
  };

  return (
    <div className="border border-red-300 bg-red-50 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left text-red-800">
        <Siren className="w-4 h-4" />
        <span className="text-sm font-semibold">
          {threads.length} Kunden-Eskalation{threads.length === 1 ? '' : 'en'} erfordert Handeln
        </span>
        <span className="text-xs text-red-700/80 truncate hidden sm:inline">
          · {threads.slice(0, 2).map(t => t.customer_label || t.subject || '—').join(' · ')}
        </span>
        {open ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {threads.map(t => (
            <EscalationInterventionCard key={t.id} thread={t} linkedProjects={projectsForCustomer(t.customer_label)} />
          ))}
        </div>
      )}
    </div>
  );
}