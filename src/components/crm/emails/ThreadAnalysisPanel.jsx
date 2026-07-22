import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Save, AlertTriangle } from 'lucide-react';
import { emailApi } from '@/components/crm/emails/emailApi';
import { EMAIL_CATEGORIES, EMAIL_THREAD_STATUSES, SENTIMENT_META } from '@/components/crm/emails/emailConfig';

// KI-Auswertung eines Threads: Kategorie, Status, Stimmung, Eskalation, Zusammenfassung.
// Nach Freigabe werden die schreibbaren Felder in die E-Mail-Datenbank zurückgeschrieben.
export default function ThreadAnalysisPanel({ thread, messages, onSaved }) {
  const [busy, setBusy] = useState(null); // 'analyze' | 'save'
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const runAnalysis = async () => {
    setBusy('analyze'); setError(null);
    try {
      const convo = messages
        .slice(0, 15)
        .map((m) => `[${m.direction === 'in' ? 'KUNDE' : m.direction === 'out' ? 'WIR' : 'INTERN'}] ${m.from_name || m.from} (${m.received_at}):\n${(m.text || m.preview || '').slice(0, 3000)}`)
        .join('\n\n---\n\n');
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Du bist der E-Mail-Analyst einer Digitalagentur (Rittler & Co). Analysiere die folgende E-Mail-Konversation mit einem Kunden. Antworte auf Deutsch, präzise und ohne Erfindungen.

BETREFF: ${thread.subject || '—'}
KUNDE (falls bekannt): ${thread.customer || '—'}

KONVERSATION (neueste zuerst):
"""
${convo}
"""

Bewerte: Kategorie, Bearbeitungsstatus, Stimmung des Kunden, ob Eskalationsgefahr besteht (unzufriedener Kunde, Beschwerden, Fristdruck, Mahnungen), ob aktives Handeln unsererseits nötig ist, und fasse den Stand in 2-3 Sätzen zusammen.`,
        response_json_schema: {
          type: 'object',
          properties: {
            summary: { type: 'string', description: 'Kurz-Zusammenfassung des Threads (2-3 Sätze)' },
            category: { type: 'string', enum: Object.keys(EMAIL_CATEGORIES) },
            status: { type: 'string', enum: Object.keys(EMAIL_THREAD_STATUSES) },
            sentiment: { type: 'string', enum: ['positiv', 'neutral', 'angespannt', 'negativ'] },
            eskalation: { type: 'boolean' },
            action_needed: { type: 'string', description: 'Konkreter Handlungsbedarf unsererseits, leer wenn keiner' },
            customer_normalized: { type: 'string', description: 'Firmenname des Kunden, leer wenn nicht erkennbar' },
          },
        },
      });
      setResult(res);
    } catch (e) {
      setError('Analyse fehlgeschlagen: ' + (e?.message || ''));
    }
    setBusy(null);
  };

  const saveBack = async () => {
    setBusy('save'); setError(null);
    try {
      const fields = {
        summary: result.summary || '',
        category: result.category || 'sonstiges',
        status: result.status || 'offen',
        eskalation: result.eskalation ? 1 : 0,
        zuordnung_status: 'automatisch',
        klass_modell: 'base44-invokellm',
      };
      if (result.customer_normalized?.trim() && !thread.customer) {
        fields.customer_normalized = result.customer_normalized.trim();
      }
      await emailApi('enrich', { thread_id: thread.id, fields });
      setResult(null);
      onSaved?.();
    } catch (e) {
      setError('Zurückschreiben fehlgeschlagen: ' + (e?.response?.data?.error || e?.message || ''));
    }
    setBusy(null);
  };

  const senti = result ? SENTIMENT_META[result.sentiment] : null;

  return (
    <div className="rounded-xl border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" /> KI-Auswertung
        </p>
        <Button size="sm" variant="outline" onClick={runAnalysis} disabled={!!busy || !messages.length} className="gap-2">
          {busy === 'analyze' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {busy === 'analyze' ? 'Analysiert…' : 'Thread analysieren'}
        </Button>
      </div>

      {result && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {EMAIL_CATEGORIES[result.category] && (
              <Badge variant="outline" className={`text-[10px] border-0 ${EMAIL_CATEGORIES[result.category].color}`}>
                {EMAIL_CATEGORIES[result.category].label}
              </Badge>
            )}
            {EMAIL_THREAD_STATUSES[result.status] && (
              <Badge variant="outline" className={`text-[10px] border-0 ${EMAIL_THREAD_STATUSES[result.status].color}`}>
                {EMAIL_THREAD_STATUSES[result.status].label}
              </Badge>
            )}
            {senti && <Badge variant="outline" className={`text-[10px] border-0 ${senti.color}`}>Stimmung: {senti.label}</Badge>}
            {result.eskalation && (
              <Badge variant="outline" className="text-[10px] border-0 bg-red-100 text-red-700 gap-1">
                <AlertTriangle className="w-3 h-3" /> Eskalationsgefahr
              </Badge>
            )}
          </div>
          <p className="text-xs leading-relaxed">{result.summary}</p>
          {result.action_needed?.trim() && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-amber-700 font-semibold mb-0.5">Handlungsbedarf</p>
              <p className="text-xs text-amber-900 leading-relaxed">{result.action_needed}</p>
            </div>
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={saveBack} disabled={!!busy} className="gap-2">
              {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Auswertung übernehmen & zurückschreiben
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}