import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Loader2, Sparkles, CheckCircle2, RefreshCw } from 'lucide-react';
import { PROPOSAL_STATUSES, MODE_LABELS, WORKFLOW_STEPS } from '@/components/crm/proposals/proposalConfig';
import { buildLargeTextPatch, loadLargeText, loadJsonField } from '@/components/crm/proposals/jsonFields';
import { runAnalysis, runMapping, runConfig, extractContext } from '@/components/crm/proposals/proposalReasoning';
import ContextEditor from '@/components/crm/proposals/ContextEditor';
import AnalysisView from '@/components/crm/proposals/AnalysisView';
import MappingView from '@/components/crm/proposals/MappingView';
import RenderPanel from '@/components/crm/proposals/RenderPanel';

export default function CrmProposalDetail() {
  const { proposalId } = useParams();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [correction, setCorrection] = useState('');
  const [busy, setBusy] = useState(null); // 'save' | 'analysis' | 'mapping' | 'config'
  const [error, setError] = useState(null);

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

  const autostartRef = useRef(false);
  useEffect(() => {
    if (!proposal) return;
    loadLargeText(proposal, 'input_text').then((t) => {
      setNotes(t);
      const urlParams = new URLSearchParams(window.location.search);
      if (!autostartRef.current && urlParams.get('autostart') === '1' && proposal.status === 'input' && t.trim()) {
        autostartRef.current = true;
        startAnalysis(false, t);
      }
    });
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

  const startAnalysis = async (withCorrection, textOverride) => {
    const inputText = textOverride ?? notes;
    setBusy('analysis'); setError(null);
    try {
      const notesPatch = await buildLargeTextPatch('input_text', inputText, 'gespraechsnotizen.txt');
      await base44.entities.CrmProposal.update(proposalId, {
        ...notesPatch,
        analysis_correction: withCorrection ? correction : '',
      });
      let fresh = await base44.entities.CrmProposal.get(proposalId);
      if (!fresh.client_core_business && !fresh.client_project_scope) {
        const ctx = await extractContext(inputText);
        const ctxPatch = {};
        ['customer_company', 'contact_person', 'client_core_business', 'client_industry',
          'client_target_audience', 'client_usp', 'client_existing_marketing', 'client_project_scope']
          .forEach(f => { if (ctx?.[f] && !fresh[f]) ctxPatch[f] = ctx[f]; });
        if (Object.keys(ctxPatch).length > 0) {
          await base44.entities.CrmProposal.update(proposalId, ctxPatch);
          fresh = await base44.entities.CrmProposal.get(proposalId);
        }
      }
      const result = await runAnalysis(fresh);
      const jsonPatch = await buildLargeTextPatch('analysis_json', JSON.stringify(result), 'analysis.json');
      await update({ ...jsonPatch, status: 'analysis_review', error_message: '' });
      setCorrection('');
    } catch (e) {
      setError('Analyse fehlgeschlagen: ' + (e?.message || ''));
    }
    setBusy(null);
  };

  const approveAnalysisAndMap = async (withCorrection) => {
    setBusy('mapping'); setError(null);
    try {
      const user = await base44.auth.me().catch(() => null);
      await base44.entities.CrmProposal.update(proposalId, {
        mapping_correction: withCorrection ? correction : '',
        analysis_approved_at: new Date().toISOString(),
        analysis_approved_by: user?.email || '',
      });
      const fresh = await base44.entities.CrmProposal.get(proposalId);
      const result = await runMapping(fresh, analysis);
      const jsonPatch = await buildLargeTextPatch('mapping_json', JSON.stringify(result), 'mapping.json');
      await update({ ...jsonPatch, status: 'mapping_review', error_message: '' });
      setCorrection('');
    } catch (e) {
      setError('Mapping fehlgeschlagen: ' + (e?.message || ''));
    }
    setBusy(null);
  };

  const approveMappingAndConfig = async () => {
    setBusy('config'); setError(null);
    try {
      const user = await base44.auth.me().catch(() => null);
      await base44.entities.CrmProposal.update(proposalId, {
        mapping_approved_at: new Date().toISOString(),
        mapping_approved_by: user?.email || '',
      });
      const fresh = await base44.entities.CrmProposal.get(proposalId);
      const result = await runConfig(fresh, analysis, mapping);
      const jsonPatch = await buildLargeTextPatch('config_json', JSON.stringify(result), 'config.json');
      await update({ ...jsonPatch, status: 'config_ready', error_message: '' });
    } catch (e) {
      setError('Config-Erstellung fehlgeschlagen: ' + (e?.message || ''));
    }
    setBusy(null);
  };

  if (isLoading || !proposal) {
    return <p className="text-sm text-muted-foreground py-10 text-center">Angebot lädt…</p>;
  }

  const st = PROPOSAL_STATUSES[proposal.status] || PROPOSAL_STATUSES.input;
  const step = st.step;

  const correctionBox = (placeholder) => (
    <Textarea
      value={correction}
      onChange={e => setCorrection(e.target.value)}
      placeholder={placeholder}
      className="min-h-[70px] text-sm"
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
            {proposal.customer_company || '—'} · {MODE_LABELS[proposal.mode]}{proposal.sprint_mode ? ' · Sprint' : ''} · {proposal.signed_by}
          </p>
        </div>
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${st.color}`}>{st.label}</span>
      </div>

      <div className="flex gap-1 flex-wrap">
        {WORKFLOW_STEPS.map((s, i) => (
          <span key={s.key} className={`text-[10px] px-2 py-1 rounded-full font-medium ${
            i + 1 < step ? 'bg-emerald-100 text-emerald-600' : i + 1 === step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}>{s.label}</span>
        ))}
      </div>

      {error && <p className="text-xs text-destructive border border-destructive/30 bg-destructive/5 rounded-lg p-3">{error}</p>}

      <ContextEditor
        proposal={proposal}
        notes={notes}
        onNotesChange={setNotes}
        onSave={saveInput}
        saving={busy === 'save'}
      />

      {step === 1 && (
        <div className="flex justify-end">
          <Button onClick={() => startAnalysis(false)} disabled={!!busy || !notes.trim()} className="gap-2">
            {busy === 'analysis' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {busy === 'analysis' ? 'Analyse läuft…' : 'Strategische Analyse starten'}
          </Button>
        </div>
      )}

      {analysis && step >= 2 && <AnalysisView analysis={analysis} />}

      {step === 2 && (
        <div className="border rounded-xl bg-card p-4 space-y-3">
          <p className="text-xs font-semibold">Stopp 1 — Analyse freigeben oder korrigieren</p>
          {correctionBox('Korrektur zur Analyse (optional) — z.B. anderer Projekttyp, fehlendes Thema, anderes Format…')}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => startAnalysis(true)} disabled={!!busy || !correction.trim()} className="gap-2">
              {busy === 'analysis' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Analyse überarbeiten
            </Button>
            <Button onClick={() => approveAnalysisAndMap(false)} disabled={!!busy} className="gap-2">
              {busy === 'mapping' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {busy === 'mapping' ? 'Mapping läuft…' : 'Freigeben & Mapping erstellen'}
            </Button>
          </div>
        </div>
      )}

      {mapping && step >= 3 && <MappingView mapping={mapping} />}

      {step === 3 && (
        <div className="border rounded-xl bg-card p-4 space-y-3">
          <p className="text-xs font-semibold">Stopp 2 — Mapping & Preise freigeben oder korrigieren</p>
          {correctionBox('Korrektur zum Mapping (optional) — z.B. Position streichen, Preis anpassen, Struktur ändern…')}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => approveAnalysisAndMap(true)} disabled={!!busy || !correction.trim()} className="gap-2">
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

      {step >= 4 && <RenderPanel proposal={proposal} config={config} />}
    </div>
  );
}