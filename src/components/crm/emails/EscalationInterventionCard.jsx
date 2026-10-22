import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useVorgangAktionen } from '@/components/crm/emails/EscalationCaseControls';
import { emailApi } from '@/components/crm/emails/emailApi';
import { Badge } from '@/components/ui/badge';
import { Sparkles, FolderKanban, Siren, LifeBuoy } from 'lucide-react';
import EscalationThreadPreview from '@/components/crm/emails/EscalationThreadPreview';
import { useThreadAktionen } from '@/components/crm/emails/ThreadActionBar';
import ZuweisungWahl, { nameVon } from '@/components/crm/ZuweisungWahl';
import { PostZeile, PostAktionen, PostAbschnitt, postDatum } from '@/components/post/PostBaukasten';

const STUFE_FARBE = { 1: 'text-amber-600', 2: 'text-orange-600', 3: 'text-status-critical' };

const zeitVon = (iso) => {
  const s = String(iso || '');
  const t = new Date(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`).getTime();
  return Number.isNaN(t) ? 0 : t;
};
const wartezeit = (iso) => {
  const t = zeitVon(iso);
  if (!t) return '';
  const std = Math.max(0, Math.round((Date.now() - t) / 3600000));
  if (std < 24) return `${std} Std.`;
  const tage = Math.round(std / 24);
  return `${tage} ${tage === 1 ? 'Tag' : 'Tagen'}`;
};

/**
 * Eine Eskalation — aufgebaut aus dem Post-Baukasten (gleiche Optik wie Posteingang, „Meine Post“
 * und E-Mail-Zentrale): Zeile · eine Aktionsleiste · Einschreitungsvorschlag · Verlauf.
 */
export default function EscalationInterventionCard({ zeile, offen, onOeffnen, linkedProjects = [], team = [] }) {
  const { thread, caseRecord, faelle = [], wartet, anzahl = 1, key } = zeile;
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const severity = caseRecord?.severity || 0;
  const ticketVerknuepft = faelle.some((c) => c.linked_ticket_id);

  const neuLaden = () => {
    queryClient.invalidateQueries({ queryKey: ['crm-escalations'] });
    queryClient.invalidateQueries({ queryKey: ['eskalations-liste'] });
    queryClient.invalidateQueries({ queryKey: ['posteingang'] });
  };

  // Standard-Aktionen wie überall; ein angelegtes Support-Ticket wird mit allen Vorgängen verknüpft
  const thr = useThreadAktionen({
    thread: {
      id: thread.id,
      subject: thread.subject,
      summary: thread.summary,
      customer: thread.customer_label,
      suggested_action: thread.anliegen === 'web_support' ? 'supportticket' : '',
      eskalation: true,
    },
    messages: [{ direction: 'in', from: thread.external_from, from_name: thread.last_from_name }],
    onChanged: async (ticket) => {
      if (ticket?.id) {
        await Promise.all(faelle.filter((c) => c.id).map((c) => base44.entities.CrmEscalation.update(c.id, {
          linked_ticket_id: ticket.id,
          state: c.state === 'erledigt' ? c.state : 'in_arbeit',
        }))).catch(() => {});
      }
      neuLaden();
    },
  });
  const vorgang = useVorgangAktionen({
    caseRecord,
    thread,
    weitereFaelle: faelle.filter((c) => c.id && c.id !== caseRecord?.id),
  });

  // Zuweisung über die normale Post-Zuweisung — der Vorgang wird mitgeführt
  const zuweisungsEintrag = {
    threadId: String(thread.id),
    thread: { conversation_key: String(key || '').startsWith('#') ? '' : key, subject: thread.subject },
    betreff: thread.subject,
    zustaendig: caseRecord?.assigned_to || '',
    zuweisung: null,
  };

  const generatePlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const detail = await emailApi('thread', { params: { id: thread.id, msgs: 10, full: 1 } });
      const convo = (detail.messages || [])
        .map((m) => `[${m.direction === 'in' ? 'KUNDE' : m.direction === 'out' ? 'WIR' : 'INTERN'}] ${m.from_name || m.from} (${m.received_at}):\n${(m.text || '').slice(0, 2000)}`)
        .join('\n\n---\n\n')
        .slice(0, 20000);
      const projectInfo = linkedProjects
        .map((p) => `${p.project_name} (Status: ${p.status}, offen: €${Math.round(p.open_amount || 0)}, Risiko: ${p.risk_status})`)
        .join('; ');
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Du bist Krisenberater der Digitalagentur Rittler & Co. Ein Kunde zeigt in dieser E-Mail-Konversation Eskalationsgefahr. Erstelle einen konkreten Einschreitungsplan auf Deutsch. Nichts erfinden.

KUNDE: ${thread.customer_label || 'unbekannt'}
BETREFF: ${thread.subject || '—'}
KI-BELEG: ${thread.summary || '—'}
VERKNÜPFTE PROJEKTE: ${projectInfo || 'keine gefunden'}

KONVERSATION:
"""
${convo}
"""

Liefere: (1) Kern des Problems in 1-2 Sätzen. (2) Dringlichkeit (hoch/mittel/niedrig) mit Begründung. (3) 2-4 konkrete Einschreitungsschritte in Reihenfolge (wer macht was, Kanal: Anruf/E-Mail/Termin). (4) Formulierungsvorschlag für die erste Antwort an den Kunden (3-5 Sätze, deeskalierend, professionell).`,
        response_json_schema: {
          type: 'object',
          properties: {
            problem: { type: 'string' },
            dringlichkeit: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] },
            begruendung: { type: 'string' },
            schritte: { type: 'array', items: { type: 'string' } },
            antwort_entwurf: { type: 'string' },
          },
        },
      });
      setPlan(result);
    } catch (e) {
      setError('Vorschlag konnte nicht erstellt werden. Bitte erneut versuchen.');
    }
    setLoading(false);
  };

  const urgencyColor = { hoch: 'bg-red-100 text-red-700', mittel: 'bg-amber-100 text-amber-700', niedrig: 'bg-blue-100 text-blue-700' };
  const stand = wartet
    ? `wartet seit ${wartezeit(thread.last_message_at)}`
    : ticketVerknuepft ? 'In Bearbeitung (Ticket)' : 'beantwortet · Vorgang offen';

  return (
    <PostZeile
      symbol={<Siren className={`w-4 h-4 ${STUFE_FARBE[severity] || 'text-muted-foreground'}`} />}
      ton={wartet ? (severity >= 3 ? 'critical' : 'attention') : null}
      titel={thread.subject || '(kein Betreff)'}
      unterzeile={[thread.customer_label || thread.external_from || 'Unbekannter Absender', anzahl > 1 ? `${anzahl} Verläufe` : '']
        .filter(Boolean).join(' · ')}
      einordnung={severity ? `Eskalation · Stufe ${severity}` : 'Eskalation'}
      einordnungTon="critical"
      einordnungZeile2={thread.summary}
      datum={postDatum(zeitVon(thread.last_message_at))}
      stand={stand}
      standTon={wartet ? 'critical' : null}
      zustaendig={(
        <p className="text-meta truncate">
          {caseRecord?.assigned_to
            ? <span className="font-semibold text-foreground">→ {nameVon(caseRecord.assigned_to, team)}</span>
            : <span className="text-muted-foreground">nicht zugewiesen</span>}
          {ticketVerknuepft && <span className="text-muted-foreground"> · <LifeBuoy className="inline w-3 h-3 -mt-0.5" /> Ticket</span>}
        </p>
      )}
      offen={offen}
      onOeffnen={onOeffnen}
    >
      <PostAktionen
        busy={thr.busy || vorgang.busy}
        aktionen={[
          thr.aktionen.antworten,
          { ...thr.aktionen.support, label: ticketVerknuepft ? 'Support-Ticket (anhängen)' : 'Support-Ticket' },
          { key: 'plan', label: loading ? 'Vorschlag wird erstellt …' : 'Einschreitungsvorschlag', icon: Sparkles, onClick: generatePlan, disabled: loading },
        ]}
        mehr={[thr.mehr.deal, thr.aktionen.lead && { ...thr.aktionen.lead, primaer: false }, ...vorgang.mehr]}
        rechts={<ZuweisungWahl eintrag={zuweisungsEintrag} onChanged={neuLaden} />}
      />

      {linkedProjects.length > 0 && (
        <p className="flex items-center gap-1.5 flex-wrap text-meta">
          <FolderKanban className="w-3.5 h-3.5 text-muted-foreground" />
          {linkedProjects.slice(0, 3).map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="text-primary hover:underline truncate max-w-[220px]">{p.project_name}</Link>
          ))}
        </p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {plan && (
        <PostAbschnitt titel="Einschreitungsvorschlag" zusatz={`Dringlichkeit ${plan.dringlichkeit}`}>
          <div className="border rounded-lg bg-muted/40 p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`border-0 text-[10px] ${urgencyColor[plan.dringlichkeit] || ''}`}>
                Dringlichkeit: {plan.dringlichkeit}
              </Badge>
              <span className="text-xs text-muted-foreground">{plan.begruendung}</span>
            </div>
            <p className="text-sm"><strong>Problem:</strong> {plan.problem}</p>
            <ol className="list-decimal list-inside space-y-0.5">
              {(plan.schritte || []).map((s, i) => <li key={i} className="text-xs">{s}</li>)}
            </ol>
            <p className="text-xs bg-card border rounded p-2 whitespace-pre-wrap">{plan.antwort_entwurf}</p>
          </div>
        </PostAbschnitt>
      )}

      <PostAbschnitt titel="Verlauf" zusatz="neueste Nachricht zuerst">
        <EscalationThreadPreview threadId={thread.id} start={3} />
      </PostAbschnitt>
      {thr.dialoge}
      {vorgang.dialoge}
    </PostZeile>
  );
}
