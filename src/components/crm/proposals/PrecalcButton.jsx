import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, Calculator } from 'lucide-react';
import { loadSkillRules } from '@/components/crm/proposals/skillLoader';
import { composeNotes } from '@/components/crm/proposals/sourceDocs';
import { eur } from '@/components/crm/stages';

// Freiwillige Vorkalkulation — läuft über dieselben Quellen wie die Analyse und
// legt das Ergebnis als Quelldokument ab. Wer nicht drückt, bekommt keine Zahlen vorgegeben.
export default function PrecalcButton({ proposal, notes, disabled, onAdd }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const already = (proposal.source_documents || []).some((d) => (d.label || '').includes('Vorkalkulation'));

  const run = async () => {
    setBusy(true); setError(null);
    try {
      const [rules, composed] = await Promise.all([
        loadSkillRules(proposal.mode || 'full').catch(() => ''),
        composeNotes(proposal, notes),
      ]);
      const calc = await base44.integrations.Core.InvokeLLM({
        prompt: `Du bist Kalkulator der Digitalagentur Rittler & Co (Österreich). Erstelle aus den folgenden Quellen eine plausible Vorkalkulation für ein Angebot. Antworte auf Deutsch.
${rules ? `\nVERBINDLICHE REGELWERKE (Kalkulationsparameter aus sales-rules.md verwenden):\n${rules.slice(0, 60000)}\n` : ''}
QUELLEN (Anfrage, Transkripte, Notizen):
"""
${composed.slice(0, 60000)}
"""

Regeln:
- Zerlege die Anfrage in 3-7 konkrete Leistungspositionen (z.B. Konzeption, Design, Umsetzung, Content, Projektmanagement).
- Stundensätze und PM-Anteil aus den Regelwerken (sales-rules.md, Regel 12) übernehmen; fehlen sie, marktübliche Sätze einer österreichischen Digitalagentur ansetzen und das explizit als Annahme ausweisen.
- Sei realistisch, nicht billig. Pauschalen sind erlaubt.
- Liste getroffene Annahmen explizit auf.`,
        response_json_schema: {
          type: 'object',
          properties: {
            positions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  hours: { type: 'number' },
                  amount_net: { type: 'number' },
                },
              },
            },
            total_net: { type: 'number' },
            assumptions: { type: 'array', items: { type: 'string' } },
          },
        },
      });

      const text = [
        `VORKALKULATION (KI-Schätzung) — ${proposal.customer_company || proposal.title}`,
        '',
        ...(calc.positions || []).map((p, i) =>
          `${i + 1}. ${p.title} — ${eur(p.amount_net)}${p.hours ? ` (~${p.hours} h)` : ''}\n   ${p.description || ''}`),
        '',
        `SUMME NETTO: ${eur(calc.total_net)}`,
        '',
        'Annahmen:',
        ...(calc.assumptions || []).map((a) => `- ${a}`),
      ].join('\n');

      onAdd({ doc_type: 'briefing', label: 'Vorkalkulation (KI)', text, size_chars: text.length, added_at: new Date().toISOString() });
    } catch (e) {
      setError('Vorkalkulation fehlgeschlagen: ' + (e?.message || ''));
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" onClick={run} disabled={disabled || busy} className="gap-2">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
        {busy ? 'Vorkalkulation läuft…' : already ? 'Vorkalkulation erneut erstellen (optional)' : 'Vorkalkulation erstellen (optional)'}
      </Button>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}