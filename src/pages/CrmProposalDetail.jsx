import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Sparkles, CheckCircle2, RefreshCw } from 'lucide-react';
import { PROPOSAL_STATUSES, MODE_LABELS, OFFER_TYPES, workflowSteps, stepForStatus } from '@/components/crm/proposals/proposalConfig';
import { buildLargeTextPatch, loadLargeText, loadJsonField } from '@/components/crm/proposals/jsonFields';
import { runAnalysis, runMapping, runConfig, extractContext } from '@/components/crm/proposals/proposalReasoning';
import { composeNotes } from '@/components/crm/proposals/sourceDocs';
import ContextEditor from '@/components/crm/proposals/ContextEditor';
import AnalysisView from '@/components/crm/proposals/AnalysisView';
import MappingView from '@/components/crm/proposals/MappingView';
import RenderPanel from '@/components/crm/proposals/RenderPanel';
import CorrectionInput from '@/components/crm/proposals/CorrectionInput';
import ProgressLog, { analyzeError } from '@/components/crm/proposals/ProgressLog';
import OfferTypeSelector from '@/components/crm/proposals/OfferTypeSelector';
import { runEmailOffer } from '@/components/crm/proposals/emailOffer';
import SourceDocumentsPanel from '@/components/crm/proposals/SourceDocumentsPanel';
import PrecalcButton from '@/components/crm/proposals/PrecalcButton';
import { Textarea } from '@/components/ui/textarea';
import DeleteProposalButton from '@/components/crm/proposals/DeleteProposalButton';

export default function CrmProposalDetail() {
  const { proposalId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [correction, setCorrection] = useState('');
  const [busy, setBusy] = useState(null); // 'save' | 'analysis' | 'mapping' | 'config'
  const [error, setError] = useState(null); // { message, advice[] }
  const [log, setLog] = useState([]);

  const logStep = (text) => setLog(prev => [
    ...prev.map(l => l.status === 'running' ? { ...l, status: 'done' } : l),
    { text, status: 'running', time: new Date().toLocaleTimeString('de-AT') },
  ]);
  const logFail = () => setLog(prev => prev.map(l => l.status === 'running' ? { ...l, status: 'error' } : l));

  const { data: proposal, isLoading } = useQuery({
    queryKey: ['crm-proposal', proposalId],
    queryFn: () => base44.entities.CrmProposal.get(proposalId),
  });
  const { data: analysis } = useQuery({
    queryKey: ['crm-proposal-analysis', proposalId, proposal?.updated_date],
    queryFn: () => loadJsonField(proposal, 'analysis_json'),
    enabled: !!proposal,
  });
  const { data: mapping } = useQuery({
    queryKey: ['crm-proposal-mapping', proposalId, proposal?.updated_date],
    queryFn: () => loadJsonField(proposal, 'mapping_json'),
    enabled: !!proposal,
  });
  const { data: config } = useQuery({
    queryKey: ['crm-proposal-config', proposalId, proposal?.updated_date],
    queryFn: () => loadJsonField(proposal, 'config_json'),
    enabled: !!proposal,
  });

  // Kein Autostart: Läufe starten ausschließlich über den Startknopf.
  useEffect(() => {
    if (!proposal) return;
    loadLargeText(proposal, 'input_text').then(setNotes);
  }, [proposal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['crm-proposal', proposalId] });

  const update = async (patch) => {
    await base44.entities.CrmProposal.update(proposalId, patch);
    refresh();
  };

  const saveInput = async (contextForm) => {
    setBusy('save'); setError(null);
    const notesPatch = await buildLargeTextPatch('input_text', notes, 'gespraechsnotizen.txt');
    await update({ ...contextForm, ...notesPatch });
    setBusy(null);
  };

  const addDocument = async (doc) => {
    await update({ source_documents: [...(proposal.source_documents || []), doc] });
  };

  const removeDocument = async (idx) => {
    await update({ source_documents: (proposal.source_documents || []).filter((_, i) => i !== idx) });
  };

  const saveNotes = async () => {
    setBusy('save');
    await update(await buildLargeTextPatch('input_text', notes, 'gespraechsnotizen.txt'));
    setBusy(null);
  };

  // Vorläufige Titel aus Handoff/Anlage — werden beim ersten Lauf durch den KI-Titel ersetzt.
  const isProvisionalTitle = (t) => !t || t === 'Neues Angebot' || /^Angebot /.test(t);

  // Kontext-Extraktion läuft genau EINMAL — am Anfang des ersten echten KI-Laufs.
  const ensureContext = async (inputText) => {
    let fresh = await base44.entities.CrmProposal.get(proposalId);
    if (fresh.client_core_business || fresh.client_project_scope) return fresh;
    logStep('Kundenkontext wird aus den Dokumenten extrahiert…');
    const composed = await composeNotes(fresh, inputText);
    const ctx = await extractContext(composed.slice(0, 30000));
    const ctxPatch = {};
    ['customer_company', 'contact_person', 'client_core_business', 'client_industry',
      'client_target_audience', 'client_usp', 'client_existing_marketing', 'client_project_scope']
      .forEach(f => { if (ctx?.[f] && !fresh[f]) ctxPatch[f] = ctx[f]; });
    if (ctx?.proposal_title && isProvisionalTitle(fresh.title)) ctxPatch.title = ctx.proposal_title;
    if (Object.keys(ctxPatch).length > 0) {
      await base44.entities.CrmProposal.update(proposalId, ctxPatch);
      fresh = await base44.entities.CrmProposal.get(proposalId);
    }
    return fresh;
  };

  const startAnalysis = async (withCorrection, textOverride) => {
    const inputText = textOverride ?? notes;
    setBusy('analysis'); setError(null); setLog([]);
    try {
      logStep('Gesprächsnotizen werden gespeichert…');
      const notesPatch = await buildLargeTextPatch('input_text', inputText, 'gespraechsnotizen.txt');
      await base44.entities.CrmProposal.update(proposalId, {
        ...notesPatch,
        analysis_correction: withCorrection ? correction : '',
      });
      const fresh = await ensureContext(inputText);
      const result = await runAnalysis(fresh, logStep);
      logStep('Analyse-Ergebnis wird gespeichert…');
      const jsonPatch = await buildLargeTextPatch('analysis_json', JSON.stringify(result), 'analysis.json');
      await update({ ...jsonPatch, status: 'analysis_review', error_message: '' });
      setCorrection('');
      setLog([]);
    } catch (e) {
      logFail();
      setError(analyzeError(e, 'Strategische Analyse'));
    }
    setBusy(null);
  };

  const isBestand = proposal?.offer_type === 'bestand';

  // Typ A: Freigabe der Analyse + Mapping. Typ B (Bestand): startet direkt mit dem
  // Mapping — der Kundenkontext ersetzt die Analyse, Stopp 1 entfällt.
  const runMappingStep = async (withCorrection) => {
    setBusy('mapping'); setError(null); setLog([]);
    try {
      const fresh0 = await base44.entities.CrmProposal.get(proposalId);
      const bestand = fresh0.offer_type === 'bestand';
      logStep(bestand ? 'Positionen & Preise werden erstellt…' : 'Analyse-Freigabe wird gespeichert…');
      const user = await base44.auth.me().catch(() => null);
      const patch = { mapping_correction: withCorrection ? correction : '' };
      if (!bestand) {
        patch.analysis_approved_at = new Date().toISOString();
        patch.analysis_approved_by = user?.email || '';
      }
      await base44.entities.CrmProposal.update(proposalId, patch);
      // Kontext-Extraktion beim ersten echten Lauf (Typ B startet hier)
      const fresh = await ensureContext(notes);
      const result = await runMapping(fresh, bestand ? null : analysis, logStep);
      logStep('Mapping-Ergebnis wird gespeichert…');
      const jsonPatch = await buildLargeTextPatch('mapping_json', JSON.stringify(result), 'mapping.json');
      await update({ ...jsonPatch, status: 'mapping_review', error_message: '' });
      setCorrection('');
      setLog([]);
    } catch (e) {
      logFail();
      setError(analyzeError(e, 'Gesprächs-Mapping'));
    }
    setBusy(null);
  };

  const approveMappingAndConfig = async () => {
    setBusy('config'); setError(null); setLog([]);
    try {
      logStep('Mapping-Freigabe wird gespeichert…');
      const user = await base44.auth.me().catch(() => null);
      await base44.entities.CrmProposal.update(proposalId, {
        mapping_approved_at: new Date().toISOString(),
        mapping_approved_by: user?.email || '',
      });
      const fresh = await base44.entities.CrmProposal.get(proposalId);
      const result = await runConfig(fresh, isBestand ? null : analysis, mapping, logStep);
      logStep('Config wird gespeichert…');
      const jsonPatch = await buildLargeTextPatch('config_json', JSON.stringify(result), 'config.json');
      await update({ ...jsonPatch, status: 'config_ready', error_message: '' });
      setLog([]);
    } catch (e) {
      logFail();
      setError(analyzeError(e, 'Config-Erstellung'));
    }
    setBusy(null);
  };

  // Typ C: EIN KI-Lauf — Ergebnis wird als CrmQuote gespeichert, das CrmProposal entfällt.
  const startEmailOffer = async () => {
    setBusy('email'); setError(null); setLog([]);
    try {
      logStep('E-Mail-Angebot wird erstellt (1 KI-Lauf)…');
      const fresh = await base44.entities.CrmProposal.get(proposalId);
      const quote = await runEmailOffer(fresh, logStep);
      logStep('Angebot wird mit dem Deal verknüpft…');
      // Erst den Deal verknüpfen, dann das Angebots-Studio-Objekt löschen —
      // so bleibt bei einem Fehler nichts Verwaistes zurück.
      if (fresh.deal_id) {
        await base44.entities.CrmDeal.update(fresh.deal_id, {
          quote_id: quote.id,
          proposal_id: '',
          next_step: 'E-Mail-Angebot freigeben und senden',
        });
      }
      await base44.entities.CrmProposal.delete(proposalId);
      navigate(`/crm/quotes/${quote.id}`);
      return;
    } catch (e) {
      logFail();
      setError(analyzeError(e, 'E-Mail-Angebot'));
    }
    setBusy(null);
  };

  const isEmail = proposal?.offer_type === 'email';

  // Nach der Typbestätigung startet KEIN Lauf — der Start erfolgt ausschließlich
  // über den Startknopf auf dem Eingangsbildschirm. Erst sammeln, dann rechnen.
  const onTypeConfirmed = () => refresh();

  // Typwechsel bis zur ersten Freigabe: Analyse & Mapping verwerfen,
  // Kundenkontext und Quelldokumente behalten.
  const changeType = async () => {
    await update({
      offer_type: null, type_confirmed_at: null, offer_type_reason: '',
      analysis_json: '', analysis_json_url: '', mapping_json: '', mapping_json_url: '',
      analysis_correction: '', mapping_correction: '', status: 'input',
    });
  };

  if (isLoading || !proposal) {
    return <p className="text-sm text-muted-foreground py-10 text-center">Angebot lädt…</p>;
  }

  // Schritt 0 — Angebotstyp wählen & bestätigen. Ohne Bestätigung läuft kein KI-Lauf.
  if (!proposal.offer_type) {
    return (
      <div className="space-y-4 max-w-4xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/crm/proposals"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">{proposal.title}</h1>
            <p className="text-xs text-muted-foreground">{proposal.customer_company || '—'} · Schritt 0 — Angebotstyp wählen & bestätigen</p>
          </div>
        </div>
        {(log.length > 0 || error) && <ProgressLog lines={log} error={error} />}

        {/* Quellen VOR der Typwahl — Transkript & Co. lassen sich hinzufügen, bevor irgendetwas rechnet */}
        <SourceDocumentsPanel
          title="Quellen — Transkript, Kunden-E-Mails, Sprachmemo, Briefing"
          hint="Alles, was die KI lesen soll, jetzt hinzufügen — es läuft noch kein Lauf."
          types={['transcript', 'email', 'voice_memo', 'briefing']}
          documents={proposal.source_documents || []}
          onAdd={addDocument}
          onRemove={removeDocument}
          disabled={!!busy}
        />
        <div className="border rounded-xl bg-card p-4 space-y-2">
          <p className="text-xs font-semibold">Manuelle Notizen (optional)</p>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Zusätzliche eigene Notizen — Dokumente bitte oben als Anhang hinzufügen…"
            className="min-h-[90px] text-sm"
            disabled={!!busy}
          />
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={saveNotes} disabled={!!busy}>
              {busy === 'save' ? 'Speichert…' : 'Notizen speichern'}
            </Button>
          </div>
        </div>

        <OfferTypeSelector proposal={proposal} busy={!!busy} onConfirmed={onTypeConfirmed} />

        <div className="pt-2 border-t">
          <DeleteProposalButton proposal={proposal} disabled={!!busy} />
        </div>
      </div>
    );
  }

  const st = PROPOSAL_STATUSES[proposal.status] || PROPOSAL_STATUSES.input;
  const steps = workflowSteps(proposal.offer_type);
  const step = stepForStatus(proposal.offer_type, proposal.status);

  const correctionBox = (placeholder) => (
    <CorrectionInput
      value={correction}
      onChange={setCorrection}
      placeholder={placeholder}
      disabled={!!busy}
    />
  );

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/crm/proposals"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">{proposal.title}</h1>
          <p className="text-xs text-muted-foreground">
            {proposal.customer_company || '—'} · {OFFER_TYPES[proposal.offer_type]?.label || MODE_LABELS[proposal.mode]}{proposal.sprint_mode ? ' · Sprint' : ''} · {proposal.signed_by}
          </p>
        </div>
        {!proposal.analysis_approved_at && !proposal.mapping_approved_at && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={changeType} disabled={!!busy}>
            Typ ändern
          </Button>
        )}
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${st.color}`}>{st.label}</span>
      </div>

      <div className="flex gap-1 flex-wrap">
        {steps.map((s, i) => (
          <span key={s.key} className={`text-[10px] px-2 py-1 rounded-full font-medium ${
            i + 1 < step ? 'bg-emerald-100 text-emerald-600' : i + 1 === step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}>{s.label}</span>
        ))}
      </div>

      {(log.length > 0 || error) && <ProgressLog lines={log} error={error} />}

      <ContextEditor
        proposal={proposal}
        notes={notes}
        onNotesChange={setNotes}
        onSave={saveInput}
        saving={busy === 'save'}
        onAddDocument={addDocument}
        onRemoveDocument={removeDocument}
      />

      {proposal.status === 'input' && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground text-right">
            Gelesen werden: {(proposal.source_documents || []).length} Dokument{(proposal.source_documents || []).length === 1 ? '' : 'e'}
            {(proposal.source_documents || []).length > 0 ? ` (${(proposal.source_documents || []).map((d) => d.label).join(', ')})` : ''} und {notes.trim().length} Zeichen Notizen.
            {' '}Fehlt ein Transkript oder eine Kunden-E-Mail — jetzt hinzufügen, später fließt sie nicht mehr in die Analyse ein.
          </p>
          <div className="flex justify-end gap-2 flex-wrap">
            <PrecalcButton proposal={proposal} notes={notes} disabled={!!busy} onAdd={addDocument} />
            <Button
              onClick={() => (isEmail ? startEmailOffer() : isBestand ? runMappingStep(false) : startAnalysis(false))}
              disabled={!!busy || (!notes.trim() && !(proposal.source_documents || []).length)}
              className="gap-2"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {busy
                ? (isEmail ? 'E-Mail-Angebot wird erstellt…' : isBestand ? 'Positionen werden erstellt…' : 'Analyse läuft…')
                : (isEmail ? 'E-Mail-Angebot erstellen' : isBestand ? 'Positionen & Preise erstellen' : 'Strategische Analyse starten')}
            </Button>
          </div>
        </div>
      )}

      {!isBestand && analysis && step >= 2 && <AnalysisView analysis={analysis} />}

      {!isBestand && proposal.status === 'analysis_review' && (
        <div className="sticky bottom-3 z-30 border rounded-xl bg-card p-4 space-y-3 shadow-xl">
          <p className="text-xs font-semibold">Stopp 1 — Analyse freigeben oder korrigieren</p>
          {correctionBox('Korrektur zur Analyse (optional) — z.B. anderer Projekttyp, fehlendes Thema, anderes Format…')}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => startAnalysis(true)} disabled={!!busy || !correction.trim()} className="gap-2">
              {busy === 'analysis' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Analyse überarbeiten
            </Button>
            <Button onClick={() => runMappingStep(false)} disabled={!!busy} className="gap-2">
              {busy === 'mapping' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {busy === 'mapping' ? 'Mapping läuft…' : 'Freigeben & Mapping erstellen'}
            </Button>
          </div>
        </div>
      )}

      {mapping && ['mapping_review', 'config_ready', 'rendering', 'rendered'].includes(proposal.status) && <MappingView mapping={mapping} />}

      {proposal.status === 'mapping_review' && (
        <div className="sticky bottom-3 z-30 border rounded-xl bg-card p-4 space-y-3 shadow-xl">
          {(mapping?.sales_gap_hints || []).length > 0 && (
            <div className="text-xs bg-amber-50 border border-amber-200 rounded-md p-2.5 text-amber-800">
              <p className="font-semibold mb-1">Verkaufsrelevante Hinweise aus dem Mapping:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {mapping.sales_gap_hints.map((h, i) => <li key={i}>{h}</li>)}
              </ul>
            </div>
          )}
          <p className="text-xs font-semibold">{isBestand ? 'Stopp — Positionen & Preise freigeben oder korrigieren' : 'Stopp 2 — Mapping & Preise freigeben oder korrigieren'}</p>
          {correctionBox('Korrektur zum Mapping (optional) — z.B. Position streichen, Preis anpassen, Struktur ändern…')}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => runMappingStep(true)} disabled={!!busy || !correction.trim()} className="gap-2">
              {busy === 'mapping' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Mapping überarbeiten
            </Button>
            <Button onClick={approveMappingAndConfig} disabled={!!busy} className="gap-2">
              {busy === 'config' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {busy === 'config' ? 'Config wird erstellt…' : 'Freigeben & Config erstellen'}
            </Button>
          </div>
        </div>
      )}

      {['config_ready', 'rendering', 'rendered'].includes(proposal.status) && (
        <RenderPanel
          proposal={proposal}
          config={config}
          onRefresh={refresh}
          onRegenerateConfig={approveMappingAndConfig}
          regenerating={busy === 'config'}
        />
      )}

      <div className="pt-2 border-t">
        <DeleteProposalButton proposal={proposal} disabled={!!busy} />
      </div>
    </div>
  );
}