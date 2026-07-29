import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

// Rendert ein Angebots-PDF ausschliesslich ueber den externen Python-Render-Service
// (generate_proposal.py aus dem Skill-Paket). Es gibt bewusst KEINEN Fallback-Renderer:
// ein zweites Layout wuerde vom Skill-Corporate-Design wegdriften.
export default async function (req) {
  let base44;
  let proposalId;
  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    proposalId = body?.proposal_id;
    if (!proposalId) return Response.json({ error: 'proposal_id fehlt' }, { status: 400 });

    const renderUrl = secrets.get('PROPOSAL_RENDER_URL');
    const renderToken = secrets.get('PROPOSAL_RENDER_TOKEN');
    if (!renderUrl || !renderToken) {
      return Response.json({
        error: 'Render-Service nicht konfiguriert',
        details: 'Die Secrets PROPOSAL_RENDER_URL und PROPOSAL_RENDER_TOKEN sind nicht gesetzt. Das PDF kann nur vom Python-Render-Service erzeugt werden.',
      }, { status: 503 });
    }

    const proposal = await base44.asServiceRole.entities.CrmProposal.get(proposalId);
    if (!proposal) return Response.json({ error: 'Angebot nicht gefunden' }, { status: 404 });
    if (proposal.status === 'rendering') {
      return Response.json({ error: 'Es laeuft bereits eine PDF-Erzeugung fuer dieses Angebot.' }, { status: 409 });
    }

    // Config aufloesen: inline oder aus der Datei-URL nachladen
    let configRaw = proposal.config_json;
    if (!configRaw && proposal.config_json_url) {
      const cfgRes = await fetch(proposal.config_json_url);
      if (!cfgRes.ok) throw new Error(`Config-Datei nicht lesbar (HTTP ${cfgRes.status})`);
      configRaw = await cfgRes.text();
    }
    if (!configRaw) throw new Error('Keine Render-Config vorhanden — Schritt "Config" zuerst abschliessen.');

    let config;
    try {
      config = JSON.parse(configRaw);
    } catch {
      throw new Error('Render-Config ist kein gueltiges JSON.');
    }

    await base44.asServiceRole.entities.CrmProposal.update(proposalId, { status: 'rendering', error_message: '' });

    const base = renderUrl.replace(/\/+$/, '');
    const renderRes = await fetch(`${base}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${renderToken}` },
      body: JSON.stringify({ variant: proposal.mode, config, logo_url: proposal.logo_url || null }),
    });

    if (!renderRes.ok) {
      const text = await renderRes.text();
      throw new Error(`Render-Service antwortete mit HTTP ${renderRes.status}: ${text.slice(0, 300)}`);
    }

    const pdfBytes = await renderRes.arrayBuffer();
    if (!pdfBytes.byteLength) throw new Error('Render-Service lieferte ein leeres PDF.');

    const safeName = (proposal.customer_company || proposal.title || 'Angebot').replace(/[^\w\-]+/g, '_').slice(0, 60);
    // Erstes PDF bleibt Version 1 — erst ein erneutes Rendern zaehlt hoch
    const nextVersion = proposal.pdf_url ? (proposal.version || 1) + 1 : (proposal.version || 1);
    const file = new File([pdfBytes], `Angebot_${safeName}_v${nextVersion}.pdf`, { type: 'application/pdf' });
    const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file });

    await base44.asServiceRole.entities.CrmProposal.update(proposalId, {
      pdf_url: file_url,
      status: 'rendered',
      pdf_generated_at: new Date().toISOString(),
      version: nextVersion,
      error_message: '',
    });

    return Response.json({ success: true, pdf_url: file_url, version: nextVersion });
  } catch (error) {
    if (base44 && proposalId) {
      try {
        // Nicht auf 'error' (step 0) setzen: die Detailseite blendet dann alle Panels aus
        // und das Angebot waere ohne Rueckweg unbedienbar. Zurueck auf config_ready,
        // damit "PDF erzeugen" erneut ausgeloest werden kann — nur die Meldung wird gefuellt.
        await base44.asServiceRole.entities.CrmProposal.update(proposalId, {
          status: 'config_ready',
          error_message: String(error.message || error).slice(0, 900),
        });
      } catch (_e) { /* Statusschreiben darf die Fehlerantwort nicht verdecken */ }
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
}