import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { isCaseVisible } from '@/hooks/useCrmEscalationCases';
import { vertraulichGrund } from '@/lib/crm/vertraulich';
import { deriveCustomerFromEmail } from '@/components/crm/emails/emailConfig';

export const ESKALATIONEN_KEY = ['eskalations-liste'];

const zeitVon = (s) => {
  const str = String(s || '');
  const t = new Date(str.includes('T') ? str : `${str.replace(' ', 'T')}Z`).getTime();
  return Number.isNaN(t) ? 0 : t;
};

// In Stücken abfragen — $in-Listen nicht beliebig lang
async function inStuecken(werte, abfrage, groesse = 150) {
  const out = [];
  for (let i = 0; i < werte.length; i += groesse) out.push(...(await abfrage(werte.slice(i, i + groesse))));
  return out;
}

/**
 * Vollständige Quelle der Kunden-Eskalationen (22.10.2026): ALLE offenen Vorgänge (CrmEscalation)
 * plus das Verlaufs-Verzeichnis — nicht mehr die 200 neuesten Mails aus der E-Mail-Datenbank,
 * die nur wenige Tage abdeckten. Vertrauliche Post wird wie überall ausgeblendet.
 */
async function ladeEskalationen() {
  const [faelle, regeln] = await Promise.all([
    base44.entities.CrmEscalation.filter({ state: { $ne: 'erledigt' } }, '-created_at', 1000),
    base44.entities.InboxBlockedSender.list('-created_date', 200).catch(() => []),
  ]);
  const offen = faelle.filter((c) => isCaseVisible(c));
  const ids = [...new Set(offen.map((c) => String(c.thread_id)).filter(Boolean))];
  const zeilen = await inStuecken(ids, (teil) =>
    base44.entities.EmailThreadIndex.filter({ thread_id: { $in: teil } }, '-last_message_at', 500));
  // Alle Verläufe derselben Konversationen — für „wartet der Kunde?“ und „wer schrieb zuletzt?“
  const keys = [...new Set(zeilen.map((z) => z.conversation_key).filter(Boolean))];
  const konversation = await inStuecken(keys, (teil) =>
    base44.entities.EmailThreadIndex.filter({ conversation_key: { $in: teil } }, '-last_message_at', 1000));
  return { faelle: offen, zeilen, konversation, regeln };
}

export function useEskalationsListe({ enabled = true } = {}) {
  const { user } = useAuth();
  const istAdmin = user?.role === 'admin';
  const query = useQuery({
    queryKey: ESKALATIONEN_KEY,
    queryFn: ladeEskalationen,
    enabled,
    staleTime: 60 * 1000,
    refetchInterval: 3 * 60 * 1000,
  });

  const zeilen = useMemo(() => {
    const d = query.data;
    if (!d) return [];
    const aktiv = d.regeln.filter((r) => r.is_active !== false);
    const idxNachThread = new Map(d.zeilen.map((z) => [String(z.thread_id), z]));
    const nachKey = new Map();
    for (const r of d.konversation) {
      if (!nachKey.has(r.conversation_key)) nachKey.set(r.conversation_key, []);
      nachKey.get(r.conversation_key).push(r);
    }

    const gruppen = new Map();
    for (const c of d.faelle) {
      const idx = idxNachThread.get(String(c.thread_id)) || null;
      // Ohne Verzeichniszeile lässt sich die Vertraulichkeit nicht prüfen — dann nur für Admins
      if (!idx && !istAdmin) continue;
      // Vertraulich (Masseverwalter, Verwaltung, nur an den GF) — gleiche Regel wie Posteingang und E-Mail-Zentrale
      if (idx && vertraulichGrund({ absender: [idx.last_from, idx.last_inbound_from], empfaenger: idx.last_to, regeln: aktiv, istAdmin })) continue;
      const key = idx?.conversation_key || `#${c.thread_id}`;
      if (!gruppen.has(key)) gruppen.set(key, []);
      gruppen.get(key).push({ c, idx });
    }

    return [...gruppen.entries()].map(([key, liste]) => {
      const verlaeufe = nachKey.get(key) || liste.map((x) => x.idx).filter(Boolean);
      const neuesteZeile = verlaeufe.reduce((a, b) => (zeitVon(b?.last_message_at) > zeitVon(a?.last_message_at) ? b : a), verlaeufe[0] || null);
      const neuesterFall = liste.reduce((a, b) => (zeitVon(b.idx?.last_message_at || b.c.created_at) > zeitVon(a.idx?.last_message_at || a.c.created_at) ? b : a));
      const faelle = liste.map((x) => x.c);
      const ticket = faelle.some((c) => c.linked_ticket_id);
      const offenImPosteingang = verlaeufe.some((v) => v?.needs_reply);
      // Hat der Kunde zuletzt geschrieben? (interne Weiterleitungen zählen nicht als Antwort)
      const relevante = verlaeufe.filter((v) => ['in', 'out'].includes(v?.last_direction));
      const juengste = relevante.reduce((a, b) => (zeitVon(b.last_message_at) > zeitVon(a?.last_message_at) ? b : a), null);
      const kundeZuletzt = juengste?.last_direction === 'in';
      // Mit Ticket bleibt der Fall bei „Kunde wartet“, bis wirklich geantwortet ist
      const wartet = offenImPosteingang || (ticket && kundeZuletzt);
      const quelle = neuesterFall.idx || neuesteZeile || {};
      const fallBasis = neuesterFall.c;
      return {
        key,
        anzahl: liste.length,
        faelle,
        ticket,
        wartet,
        kundeZuletzt,
        caseRecord: {
          ...fallBasis,
          severity: Math.max(...faelle.map((c) => c.severity || 0)),
          assigned_to: fallBasis.assigned_to || faelle.find((c) => c.assigned_to)?.assigned_to || '',
        },
        thread: {
          id: Number(fallBasis.thread_id),
          subject: quelle.subject || fallBasis.subject || '',
          customer_label: fallBasis.customer_name || quelle.customer || deriveCustomerFromEmail(quelle.last_inbound_from) || '',
          external_from: quelle.last_inbound_from || '',
          last_from: quelle.last_from || '',
          last_from_name: quelle.last_from_name || '',
          last_to: quelle.last_to || '',
          message_count: quelle.message_count || 0,
          last_message_at: (neuesteZeile || quelle).last_message_at || fallBasis.created_at,
          summary: fallBasis.evidence ? `„${fallBasis.evidence}“` : '',
          anliegen: quelle.anliegen || '',
        },
      };
    });
  }, [query.data, istAdmin]);

  const wartend = zeilen.filter((z) => z.wartet).length;
  return { zeilen, wartend, isLoading: query.isLoading, isError: query.isError };
}
