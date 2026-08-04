import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, Presentation, ExternalLink } from 'lucide-react';
import { eur } from '@/components/crm/stages';

// Ein Klick: Anfrage → Angebots-Studio inkl. automatischer KI-Vorkalkulation.
// Die Vorkalkulation wird als eigenes Quell-Dokument ins Angebot gelegt und
// fließt so direkt in die Analyse/Angebotserstellung ein.
export default function ProposalHandoffButton({ deal, onDone }) {
  const navigate = useNavigate();
  const [working, setWorking] = useState(false);
  const [step, setStep] = useState('');
  const [error, setError] = useState(null);

  if (deal.proposal_id) {
    return (
      <Button size="sm" variant="outline" className="gap-1.5" asChild>
        <Link to={`/crm/proposals/${deal.proposal_id}`}>
          <ExternalLink className="w-3.5 h-3.5" /> Angebot öffnen
        </Link>
      </Button>
    );
  }

  const handoff = async () => {
    setWorking(true); setError(null);
    try {
      const inquiryText = [
        `Firma: ${deal.company_name || '—'}`,
        `Ansprechpartner: ${deal.contact_name || '—'}${deal.contact_position ? ` (${deal.contact_position})` : ''}`,
        deal.company_industry ? `Branche: ${deal.company_industry}` : '',
        deal.description ? `\nAnfrage:\n${deal.description}` : '',
        deal.notes ? `\nNotizen:\n${deal.notes}` : '',
        deal.enrichment_summary ? `\nFirmen-Recherche:\n${deal.enrichment_summary}` : '',
      ].filter(Boolean).join('\n');

      setStep('Vorkalkulation läuft…');
      const calc = await base44.integrations.Core.InvokeLLM({
        prompt: `Du bist Kalkulator einer österreichischen Digital-/Werbeagentur (Web, Design, Online-Marketing). Erstelle aus dieser Kundenanfrage eine plausible Vorkalkulation für ein Angebot.

${inquiryText}

Regeln:
- Zerlege die Anfrage in 3-7 konkrete Leistungspositionen (z.B. Konzeption, Design, Umsetzung, Content, Projektmanagement).
- Schätze pro Position den Stundenaufwand und kalkuliere mit einem Mischstundensatz von 110 EUR netto, sofern die Anfrage nichts anderes nahelegt. Pauschalen sind erlaubt.
- Sei realistisch, nicht billig. Projektmanagement mit ca. 10-15% einrechnen.
- Liste getroffene Annahmen explizit auf.
- Alles auf Deutsch.`,
        response_json_schema: {
          type: 'object',
          properties: {
            proposal_title: { type: 'string' },
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

      const calcText = [
        `VORKALKULATION (KI-Schätzung) — ${deal.company_name || deal.title}`,
        '',
        ...(calc.positions || []).map((p, i) =>
          `${i + 1}. ${p.title} — ${eur(p.amount_net)}${p.hours ? ` (~${p.hours} h)` : ''}\n   ${p.description || ''}`),
        '',
        `SUMME NETTO: ${eur(calc.total_net)}`,
        '',
        'Annahmen:',
        ...(calc.assumptions || []).map((a) => `- ${a}`),
      ].join('\n');

      setStep('Angebot wird angelegt…');
      const now = new Date().toISOString();
      const proposal = await base44.entities.CrmProposal.create({
        deal_id: deal.id,
        title: calc.proposal_title || `Angebot ${deal.company_name || deal.title}`,
        customer_company: deal.company_name || '',
        contact_person: deal.contact_name || '',
        client_industry: deal.company_industry || '',
        client_core_business: deal.enrichment_summary || '',
        client_project_scope: deal.description || '',
        status: 'input',
        source_documents: [
          { doc_type: 'briefing', label: 'Kundenanfrage (aus Pipeline)', text: inquiryText, size_chars: inquiryText.length, added_at: now },
          { doc_type: 'briefing', label: 'Vorkalkulation (KI)', text: calcText, size_chars: calcText.length, added_at: now },
        ],
      });

      const patch = { proposal_id: proposal.id, next_step: 'Angebot im Angebots-Studio fertigstellen' };
      if (!deal.value_net && calc.total_net > 0) patch.value_net = Math.round(calc.total_net);
      await base44.entities.CrmDeal.update(deal.id, patch);
      await base44.entities.CrmActivity.create({
        deal_id: deal.id,
        activity_type: 'system',
        title: `Ins Angebots-Studio übernommen — Vorkalkulation ${eur(calc.total_net)} netto`,
        content: calcText,
        activity_date: now,
      });

      onDone?.();
      // Weiter zum Typ-Bildschirm — kein Autostart, kein fest verdrahteter Modus.
      navigate(`/crm/proposals/${proposal.id}`);
    } catch (e) {
      setError('Übernahme fehlgeschlagen: ' + (e?.message || ''));
      setWorking(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" className="gap-1.5" onClick={handoff} disabled={working}>
        {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Presentation className="w-3.5 h-3.5" />}
        {working ? step : 'Ins Angebots-Studio'}
      </Button>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}