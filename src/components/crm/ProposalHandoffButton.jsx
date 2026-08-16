import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, Presentation, ExternalLink } from 'lucide-react';
import { threadTranscript } from '@/components/crm/support/threadDescription';

// Ein Klick: Anfrage → Angebots-Studio. Es wird NICHTS gerechnet — der Handoff
// legt nur das Angebot an und hinterlegt die Kundenanfrage als Quelldokument.
// Erst sammeln (Transkript, Mails, Briefing), dann rechnen — im Studio.
export default function ProposalHandoffButton({ deal, onDone, forceNew = false, label }) {
  const navigate = useNavigate();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);

  if (deal.proposal_id && !forceNew) {
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

      const now = new Date().toISOString();
      const threadId = deal.email_thread_id || deal.thread_id || deal.source_thread_id || '';
      const conversation = threadId ? await threadTranscript(threadId) : '';

      const sourceDocuments = [
        { doc_type: 'briefing', label: 'Kundenanfrage (aus Pipeline)', text: inquiryText, size_chars: inquiryText.length, added_at: now },
      ];
      if (conversation) {
        sourceDocuments.push({
          doc_type: 'email',
          label: 'Kunden-E-Mail (Konversation)',
          text: conversation,
          size_chars: conversation.length,
          added_at: now,
        });
      }

      const proposal = await base44.entities.CrmProposal.create({
        deal_id: deal.id,
        title: deal.company_name ? `Angebot ${deal.company_name}` : 'Neues Angebot',
        customer_company: deal.company_name || '',
        contact_person: deal.contact_name || '',
        client_industry: deal.company_industry || '',
        client_core_business: deal.enrichment_summary || '',
        client_project_scope: deal.description || '',
        status: 'input',
        source_documents: sourceDocuments,
      });

      await base44.entities.CrmDeal.update(deal.id, {
        proposal_id: proposal.id,
        quote_id: '',
        next_step: 'Angebot im Angebots-Studio fertigstellen',
      });
      await base44.entities.CrmActivity.create({
        deal_id: deal.id,
        activity_type: 'system',
        title: 'Ins Angebots-Studio übernommen',
        activity_date: now,
      });

      onDone?.();
      navigate(`/crm/proposals/${proposal.id}`);
    } catch (e) {
      setError('Übernahme fehlgeschlagen: ' + (e?.message || ''));
      setWorking(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant={forceNew ? 'outline' : 'default'} className="gap-1.5" onClick={handoff} disabled={working}>
        {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Presentation className="w-3.5 h-3.5" />}
        {working ? 'Wird angelegt…' : (label || 'Ins Angebots-Studio')}
      </Button>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}