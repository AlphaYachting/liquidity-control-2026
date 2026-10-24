import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import Seitenkopf from '@/components/shared/Seitenkopf';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEskalationsListe } from '@/hooks/useEskalationsListe';
import EscalationInterventionCard from '@/components/crm/emails/EscalationInterventionCard';
import { useTeam } from '@/components/crm/ZuweisungWahl';

const zeitVon = (s) => {
  const str = String(s || '');
  const t = new Date(str.includes('T') ? str : `${str.replace(' ', 'T')}Z`).getTime();
  return Number.isNaN(t) ? 0 : t;
};

const REITER = [
  { key: 'wartet', label: 'Kunde wartet auf Antwort', passt: (z) => z.wartet },
  { key: 'beantwortet', label: 'Beantwortet oder in Bearbeitung', passt: (z) => !z.wartet },
  { key: 'alle', label: 'Alle offenen Vorgänge', passt: () => true },
];

// Kunden-Eskalationen (22.10.2026): EINE Heimat für Eskalationen — sie stehen nicht mehr zusätzlich
// im Posteingang. Kompakte Liste, eine Zeile je Konversation, Verlauf erst beim Aufklappen,
// Support-Ticket direkt im Fall. Quelle sind alle offenen Vorgänge (useEskalationsListe).
export default function CrmEscalations() {
  const [reiter, setReiter] = useState('wartet');
  const [onlyMine, setOnlyMine] = useState(false);
  const [offenKey, setOffenKey] = useState(null);
  const { zeilen, isLoading } = useEskalationsListe();
  const { data: team = [] } = useTeam();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });
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

  const meine = (z) => !onlyMine || (z.caseRecord?.assigned_to && z.caseRecord.assigned_to === me?.email);
  const zahlen = Object.fromEntries(REITER.map((r) => [r.key, zeilen.filter(meine).filter(r.passt).length]));
  const aktiv = REITER.find((r) => r.key === reiter) || REITER[0];

  const liste = zeilen.filter(meine).filter(aktiv.passt).sort((a, b) => {
    const sev = (b.caseRecord?.severity || 0) - (a.caseRecord?.severity || 0);
    if (sev !== 0) return sev;
    // Wartende: längste Wartezeit zuerst; sonst neueste zuerst
    return reiter === 'wartet'
      ? zeitVon(a.thread.last_message_at) - zeitVon(b.thread.last_message_at)
      : zeitVon(b.thread.last_message_at) - zeitVon(a.thread.last_message_at);
  });

  return (
    <div className="max-w-[1200px] space-y-4">
      <PostReiter />
      <Seitenkopf
        bereich="CRM"
        titel="Kunden-Eskalationen"
        kontext={`${zahlen.wartet || 0} warten auf Antwort · Eskalationen stehen nur hier, nicht zusätzlich im Posteingang`}
      />

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 border-b flex-1 min-w-[320px] overflow-x-auto">
          {REITER.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => { setReiter(r.key); setOffenKey(null); }}
              className={cn(
                'h-[38px] px-3 -mb-px border-b-2 text-body font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0',
                reiter === r.key ? 'border-foreground text-foreground font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {r.label}
              <span className="rounded-full bg-muted px-1.5 text-[12px] font-semibold text-muted-foreground">{zahlen[r.key] || 0}</span>
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-md border overflow-hidden" role="group" aria-label="Zuständigkeit">
          {[[false, 'Alle'], [true, 'Nur meine']].map(([v, l]) => (
            <button
              key={l}
              type="button"
              onClick={() => setOnlyMine(v)}
              className={cn('h-8 px-2.5 text-xs font-medium border-r last:border-r-0',
                onlyMine === v ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:text-foreground')}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-12 justify-center text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Eskalationen werden geladen…
        </div>
      ) : liste.length === 0 ? (
        <div className="border rounded-xl bg-card p-10 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
          <p className="text-sm font-medium">
            {reiter === 'wartet' ? 'Kein Kunde wartet auf eine Antwort' : 'Keine offenen Vorgänge in dieser Ansicht'}
          </p>
        </div>
      ) : (
        <div className="bg-card border rounded-lg overflow-hidden divide-y">
          {liste.map((z) => (
            <EscalationInterventionCard
              key={z.key}
              zeile={z}
              team={team}
              offen={offenKey === z.key}
              onOeffnen={() => setOffenKey((k) => (k === z.key ? null : z.key))}
              linkedProjects={projectsForCustomer(z.thread.customer_label)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
