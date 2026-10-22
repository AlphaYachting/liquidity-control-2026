import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Siren, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEmailEscalations } from '@/hooks/useEmailEscalations';
import { useCrmEscalationCases, isCaseVisible } from '@/hooks/useCrmEscalationCases';
import EscalationInterventionCard from '@/components/crm/emails/EscalationInterventionCard';
import { useTeam } from '@/components/crm/ZuweisungWahl';

const zeitVon = (s) => {
  const str = String(s || '');
  const t = new Date(str.includes('T') ? str : `${str.replace(' ', 'T')}Z`).getTime();
  return Number.isNaN(t) ? 0 : t;
};

// Stand je Verlauf aus dem Verlaufs-Verzeichnis: Konversation und ob der Kunde noch auf Antwort wartet
async function ladeStand(threadIds) {
  if (!threadIds.length) return { zeilen: [], offeneKeys: [] };
  const zeilen = await base44.entities.EmailThreadIndex.filter({ thread_id: { $in: threadIds } }, '-last_message_at', 500);
  const keys = [...new Set(zeilen.map((z) => z.conversation_key).filter(Boolean))];
  const offen = keys.length
    ? await base44.entities.EmailThreadIndex.filter({ needs_reply: true, conversation_key: { $in: keys } }, '-last_message_at', 500)
    : [];
  return { zeilen, offeneKeys: offen.map((o) => o.conversation_key) };
}

const REITER = [
  { key: 'wartet', label: 'Kunde wartet auf Antwort' },
  { key: 'beantwortet', label: 'Beantwortet, Vorgang offen' },
  { key: 'alle', label: 'Alle offenen Vorgänge' },
];

// Kunden-Eskalationen — kompakte Liste nach dem Muster des Posteingangs (Entscheidung 22.10.2026):
// eine Zeile je Konversation, alles zugeklappt, Verlauf erst beim Aufklappen, Support-Ticket direkt im Fall.
export default function CrmEscalations() {
  const [reiter, setReiter] = useState('wartet');
  const [onlyMine, setOnlyMine] = useState(false);
  const [offenKey, setOffenKey] = useState(null);
  const { data: threads = [], isLoading } = useEmailEscalations();
  const { data: cases = [] } = useCrmEscalationCases();
  const { data: team = [] } = useTeam();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.LiquidityProject.list(),
  });

  const caseByThread = useMemo(() => new Map(cases.map((c) => [String(c.thread_id), c])), [cases]);
  const sichtbar = useMemo(
    () => threads.filter((t) => isCaseVisible(caseByThread.get(String(t.id)) || null)),
    [threads, caseByThread],
  );
  const ids = useMemo(() => sichtbar.map((t) => String(t.id)).sort(), [sichtbar]);
  const { data: stand = { zeilen: [], offeneKeys: [] } } = useQuery({
    queryKey: ['eskalation-stand', ids.join(',')],
    queryFn: () => ladeStand(ids),
    enabled: ids.length > 0,
    staleTime: 60 * 1000,
  });

  const projectsForCustomer = (customerName) => {
    if (!customerName) return [];
    const norm = customerName.toLowerCase();
    return projects.filter((p) => {
      const c = (p.customer || '').toLowerCase();
      return c && (c.includes(norm) || norm.includes(c.split(' ')[0]));
    });
  };

  // Eine Zeile je Konversation: Parallel-Verläufe derselben Konversation zusammenfassen
  const zeilen = useMemo(() => {
    const indexNachThread = new Map(stand.zeilen.map((z) => [String(z.thread_id), z]));
    const offeneKeys = new Set(stand.offeneKeys);
    const gruppen = new Map();
    for (const t of sichtbar) {
      const idx = indexNachThread.get(String(t.id));
      const key = idx?.conversation_key || `#${t.id}`;
      if (!gruppen.has(key)) gruppen.set(key, []);
      gruppen.get(key).push({ thread: t, caseRecord: caseByThread.get(String(t.id)) || null, idx });
    }
    return [...gruppen.entries()].map(([key, liste]) => {
      const neueste = liste.reduce((a, b) => (zeitVon(b.thread.last_message_at) > zeitVon(a.thread.last_message_at) ? b : a));
      const faelle = liste.map((x) => x.caseRecord).filter(Boolean);
      const staerkster = faelle.reduce((a, b) => ((b.severity || 0) > (a?.severity || 0) ? b : a), null);
      // Zuständigkeit: die des neuesten Falls, sonst irgendeine vergebene
      const caseRecord = neueste.caseRecord
        ? { ...neueste.caseRecord, severity: Math.max(...faelle.map((c) => c.severity || 0)), assigned_to: neueste.caseRecord.assigned_to || faelle.find((c) => c.assigned_to)?.assigned_to || '' }
        : staerkster;
      return {
        key,
        thread: neueste.thread,
        caseRecord,
        faelle,
        anzahl: liste.length,
        wartet: offeneKeys.has(key) || liste.some((x) => x.idx?.needs_reply),
      };
    });
  }, [sichtbar, stand, caseByThread]);

  const meine = (z) => !onlyMine || (z.caseRecord?.assigned_to && z.caseRecord.assigned_to === me?.email);
  const passt = (z) => (reiter === 'alle' ? true : reiter === 'wartet' ? z.wartet : !z.wartet);
  const zahlen = Object.fromEntries(REITER.map((r) => [r.key, zeilen.filter(meine).filter((z) => (r.key === 'alle' ? true : r.key === 'wartet' ? z.wartet : !z.wartet)).length]));

  const liste = zeilen.filter(meine).filter(passt).sort((a, b) => {
    const sev = (b.caseRecord?.severity || 0) - (a.caseRecord?.severity || 0);
    if (sev !== 0) return sev;
    // Wartende: längste Wartezeit zuerst; sonst neueste zuerst
    return reiter === 'wartet'
      ? zeitVon(a.thread.last_message_at) - zeitVon(b.thread.last_message_at)
      : zeitVon(b.thread.last_message_at) - zeitVon(a.thread.last_message_at);
  });

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Siren className="w-5 h-5 text-red-600" /> Kunden-Eskalationen
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Reklamationen und kritische Stimmung aus den E-Mails. Zuerst, wo der Kunde noch auf Antwort wartet.
          </p>
        </div>
      </div>

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
        <div className="border rounded-lg bg-card divide-y overflow-hidden">
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
