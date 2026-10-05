import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { threadIdOf } from '@/components/crm/inboxDecision';
import { isCaseVisible } from '@/hooks/useCrmEscalationCases';
import { baueEintraege, zaehle, POSTEINGANG_TAGE } from '@/lib/crm/posteingang';
import { useAuth } from '@/lib/AuthContext';

const utcString = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

async function ladePosteingang() {
  const grenze = utcString(Date.now() - POSTEINGANG_TAGE * 864e5);
  const [threads, items, regeln, faelle] = await Promise.all([
    base44.entities.EmailThreadIndex.filter({ needs_reply: true, last_message_at: { $gte: grenze } }, '-last_message_at', 500),
    base44.entities.CrmInboxItem.filter({ status: 'new', decision: 'offen' }, '-created_date', 200),
    base44.entities.InboxBlockedSender.list('-created_date', 200),
    base44.entities.CrmEscalation.list('-created_at', 300).catch(() => []),
  ]);
  const ids = [...new Set(items.map(threadIdOf).filter(Boolean).map(String))];
  const itemZeilen = ids.length
    ? await base44.entities.EmailThreadIndex.filter({ thread_id: { $in: ids } }, '-last_message_at', 500)
    : [];
  return { threads, items, regeln, faelle, itemZeilen };
}

// Eine Quelle für Liste, Navigationszähler und Pipeline-Knopf — Zahl und Liste laufen nie auseinander.
export function usePosteingang({ enabled = true } = {}) {
  // Vertrauliche Post (Verwaltung, Mails nur an den GF) sehen nur Admins — Masseverwalter niemand
  const { user } = useAuth();
  const istAdmin = user?.role === 'admin';
  const query = useQuery({
    queryKey: ['posteingang'],
    queryFn: ladePosteingang,
    refetchInterval: 2 * 60 * 1000,
    staleTime: 60 * 1000,
    enabled,
  });
  const minute = Math.floor(Date.now() / 60000);
  const ergebnis = useMemo(() => {
    const d = query.data;
    if (!d) return { eintraege: [], zahlen: {}, gesamt: 0, ueberfaellig: 0, eskalationen: 0 };
    const eskalationen = new Set(
      d.faelle.filter((c) => isCaseVisible(c) && (c.severity || 0) >= 1).map((c) => String(c.thread_id)),
    );
    const eintraege = baueEintraege({ ...d, eskalationen, jetzt: Date.now(), istAdmin });
    return { eintraege, ...zaehle(eintraege) };
  }, [query.data, minute, istAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...ergebnis, isLoading: query.isLoading, isError: query.isError, error: query.error };
}
