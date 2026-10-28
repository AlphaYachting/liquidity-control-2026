import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { threadIdOf } from '@/components/crm/inboxDecision';
import { isCaseVisible } from '@/hooks/useCrmEscalationCases';
import { baueEintraege, zaehle, POSTEINGANG_TAGE } from '@/lib/crm/posteingang';
import { useAuth } from '@/lib/AuthContext';
import { useZugriff } from '@/lib/useZugriff';

const utcString = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

async function ladePosteingang() {
  const grenze = utcString(Date.now() - POSTEINGANG_TAGE * 864e5);
  const [threads, items, regeln, faelle, zuweisungen] = await Promise.all([
    base44.entities.EmailThreadIndex.filter({ needs_reply: true, last_message_at: { $gte: grenze } }, '-last_message_at', 500),
    base44.entities.CrmInboxItem.filter({ status: 'new', decision: 'offen' }, '-created_date', 200),
    base44.entities.InboxBlockedSender.list('-created_date', 200),
    // Alle offenen Eskalations-Vorgänge — dieselbe Menge wie auf der Eskalationsseite
    base44.entities.CrmEscalation.filter({ state: { $ne: 'erledigt' } }, '-created_at', 1000).catch(() => []),
    base44.entities.PostZuweisung.list('-zugewiesen_am', 1000).catch(() => []),
  ]);
  const ids = [...new Set(items.map(threadIdOf).filter(Boolean).map(String))];
  const itemZeilen = ids.length
    ? await base44.entities.EmailThreadIndex.filter({ thread_id: { $in: ids } }, '-last_message_at', 500)
    : [];
  // Konversationen mit offenem Eskalations-Vorgang — der Vorgang hängt oft an einem Parallel-Verlauf
  const fallIds = [...new Set(faelle.filter((c) => isCaseVisible(c) && !c.linked_ticket_id && (c.severity || 0) >= 1).map((c) => String(c.thread_id)))];
  const fallZeilen = [];
  for (let i = 0; i < fallIds.length; i += 150) {
    fallZeilen.push(...(await base44.entities.EmailThreadIndex
      .filter({ thread_id: { $in: fallIds.slice(i, i + 150) } }, '-last_message_at', 500).catch(() => [])));
  }
  const eskalationKeys = [...new Set(fallZeilen.map((z) => z.conversation_key).filter(Boolean))];
  return { threads, items, regeln, faelle, itemZeilen, zuweisungen, eskalationKeys };
}

// Eine Quelle für Liste, Navigationszähler und Pipeline-Knopf — Zahl und Liste laufen nie auseinander.
export function usePosteingang({ enabled = true } = {}) {
  // Vertrauliche Post (Verwaltung, Mails nur an den GF) sehen nur Admins — Masseverwalter niemand
  const { user } = useAuth();
  const zugriff = useZugriff();
  const istAdmin = user?.role === 'admin';
  // Eine Heimat je Mail (22.10.2026): Wer die Kunden-Eskalationen sieht, hat Eskalationen nur dort.
  // Wer sie nicht sieht (z. B. Webentwicklung im Support-Eingang), behält sie im Posteingang.
  const siehtEskalationsseite = zugriff.darf('leitung');
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
    if (!d) return { eintraege: [], meine: [], zahlen: {}, gesamt: 0, ueberfaellig: 0, eskalationen: 0, eskalationenAusgelagert: 0 };
    const eskalationen = new Set(
      d.faelle.filter((c) => isCaseVisible(c) && !c.linked_ticket_id && (c.severity || 0) >= 1).map((c) => String(c.thread_id)),
    );
    const ich = (user?.email || '').toLowerCase();
    const alle = baueEintraege({ ...d, eskalationen, eskalationKeys: new Set(d.eskalationKeys || []), jetzt: Date.now(), istAdmin, ich });
    // Zugewiesene Post der angemeldeten Person — auch Eskalationen, sofort, ohne Wartezeit
    const meine = alle.filter((e) => ich && (e.zustaendig || '').toLowerCase() === ich);
    const eintraege = siehtEskalationsseite ? alle.filter((e) => !e.eskalation) : alle;
    const eskalationenAusgelagert = siehtEskalationsseite ? alle.filter((e) => e.eskalation).length : 0;
    return { eintraege, meine, eskalationenAusgelagert, ...zaehle(eintraege) };
  }, [query.data, minute, istAdmin, user?.email, siehtEskalationsseite]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...ergebnis, isLoading: query.isLoading, isError: query.isError, error: query.error };
}
