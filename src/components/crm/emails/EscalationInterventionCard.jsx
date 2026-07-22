import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { emailApi } from '@/components/crm/emails/emailApi';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Sparkles, Loader2, FolderKanban, Mail } from 'lucide-react';
import { formatMailDate } from '@/components/crm/emails/emailConfig';

// Eskalations-Alert mit KI-generiertem Einschreitungsvorschlag (on demand).
export default function EscalationInterventionCard({ thread, linkedProjects = [] }) {
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);

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

KUNDE: ${thread.customer_normalized || 'unbekannt'}
BETREFF: ${thread.subject || '—'}
KI-ZUSAMMENFASSUNG: ${thread.summary || '—'}
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

  return (
    <Card className="border-red-200">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{thread.customer_normalized || 'Unbekannter Absender'}</span>
              <span className="text-xs text-muted-foreground">{formatMailDate(thread.last_message_at).slice(0, 10)}</span>
            </div>
            <p className="text-sm font-medium mt-0.5">{thread.subject || '(kein Betreff)'}</p>
            {thread.summary && <p className="text-xs text-muted-foreground mt-1">{thread.summary}</p>}
            {linkedProjects.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <FolderKanban className="w-3 h-3 text-muted-foreground" />
                {linkedProjects.slice(0, 3).map((p) => (
                  <Link key={p.id} to={`/projects/${p.id}`} className="text-xs text-primary hover:underline truncate max-w-[220px]">
                    {p.project_name}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <Button size="sm" onClick={generatePlan} disabled={loading} className="gap-1.5">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Einschreitungsvorschlag
            </Button>
            <Link to="/crm/emails" className="text-xs text-primary hover:underline text-center flex items-center gap-1 justify-center">
              <Mail className="w-3 h-3" /> Zur E-Mail-Zentrale
            </Link>
          </div>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        {plan && (
          <div className="border rounded-lg bg-muted/40 p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`border-0 text-[10px] ${urgencyColor[plan.dringlichkeit] || ''}`}>
                Dringlichkeit: {plan.dringlichkeit}
              </Badge>
              <span className="text-xs text-muted-foreground">{plan.begruendung}</span>
            </div>
            <p className="text-sm"><strong>Problem:</strong> {plan.problem}</p>
            <div>
              <p className="text-xs font-semibold mb-1">Einschreitungsschritte:</p>
              <ol className="list-decimal list-inside space-y-0.5">
                {(plan.schritte || []).map((s, i) => <li key={i} className="text-xs">{s}</li>)}
              </ol>
            </div>
            <div>
              <p className="text-xs font-semibold mb-1">Formulierungsvorschlag erste Antwort:</p>
              <p className="text-xs bg-card border rounded p-2 whitespace-pre-wrap">{plan.antwort_entwurf}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}