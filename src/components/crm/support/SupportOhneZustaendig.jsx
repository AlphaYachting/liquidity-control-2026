import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';

export const OHNE_ZUSTAENDIG_KEY = ['support-ohne-zustaendig'];

// Offene Support-Tickets ohne zuständige Person (Rückmeldung John 06.10.2026): Sie dürfen nicht
// untergehen und stehen deshalb oben im Support-Eingang — mit „Mir zuweisen“.
export default function SupportOhneZustaendig() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: tickets = [] } = useQuery({
    queryKey: OHNE_ZUSTAENDIG_KEY,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const alle = await base44.entities.Ticket.filter({ origin: 'support', status: { $ne: 'erledigt' } }, '-created_date', 300);
      const ohne = alle.filter((t) => !t.archiviert && !t.assignee_email);
      if (!ohne.length) return [];
      const ids = [...new Set(ohne.map((t) => t.milestone_id).filter(Boolean))];
      const etappen = ids.length ? await base44.entities.Milestone.filter({ id: { $in: ids } }, null, 300).catch(() => []) : [];
      const sprintVon = Object.fromEntries(etappen.map((m) => [m.id, m.sprint_id]));
      return ohne.map((t) => ({ ...t, sprint_id: sprintVon[t.milestone_id] || null }));
    },
  });

  if (!tickets.length) return null;

  const mirZuweisen = async (t) => {
    await base44.entities.Ticket.update(t.id, { assignee_email: user?.email || '' });
    qc.invalidateQueries({ queryKey: OHNE_ZUSTAENDIG_KEY });
  };

  return (
    <div className="rounded-lg border border-status-attention bg-status-attention-surface px-4 py-3 space-y-2">
      <p className="text-meta font-semibold text-foreground flex items-center gap-1.5">
        <AlertTriangle className="w-4 h-4 text-status-attention" />
        {tickets.length} Support-{tickets.length === 1 ? 'Ticket' : 'Tickets'} ohne zuständige Person
      </p>
      <ul className="divide-y divide-border/60">
        {tickets.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-1.5">
            <div className="min-w-0 flex-1">
              {t.sprint_id ? (
                <Link to={`/sprint/sprints/${t.sprint_id}?aufgabe=${t.id}`} className="text-body font-medium hover:underline truncate block">{t.title}</Link>
              ) : (
                <span className="text-body font-medium truncate block">{t.title}</span>
              )}
              <span className="text-meta text-muted-foreground">{t.customer_name || 'Kunde unbekannt'}</span>
            </div>
            <Button size="sm" variant="outline" onClick={() => mirZuweisen(t)}>
              <UserPlus className="w-3.5 h-3.5" /> Mir zuweisen
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
