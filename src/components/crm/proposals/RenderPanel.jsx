import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileText, Loader2, ExternalLink, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';

export default function RenderPanel({ proposal, config, onRefresh, onRegenerateConfig, regenerating }) {
  const [showConfig, setShowConfig] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState(null);

  // E-Mail-Angebote haben bewusst kein PDF — kein Renderbereich.
  if (proposal.offer_type === 'email') return null;

  const hasConfig = !!config && Object.keys(config).length > 0;
  const configStr = hasConfig ? JSON.stringify(config, null, 2) : '';

  const downloadConfig = () => {
    const blob = new Blob([configStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `angebot_config_${proposal.customer_company || proposal.id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const generatePdf = async () => {
    setRendering(true); setError(null);
    try {
      await base44.functions.invoke('renderProposalPdf', { proposal_id: proposal.id });
      onRefresh?.();
    } catch (e) {
      const status = e?.response?.status;
      const data = e?.response?.data;
      setError(status === 503
        ? 'Render-Dienst nicht konfiguriert — die Secrets PROPOSAL_RENDER_URL und PROPOSAL_RENDER_TOKEN sind nicht gesetzt.'
        : (data?.details || data?.error || e?.message || 'PDF-Erzeugung fehlgeschlagen.'));
      // Die Funktion setzt den Status bei Fehlern serverseitig zurück — neu laden
      onRefresh?.();
    }
    setRendering(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Schritt 4 — Render-Config & PDF</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!hasConfig && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2.5">
            Die Config ist leer — der KI-Lauf hat keine Inhalte geliefert. Bitte die Config neu erzeugen, dann sind Download und PDF möglich.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={downloadConfig} disabled={!hasConfig} className="gap-2">
            <Download className="w-3.5 h-3.5" /> Config-JSON herunterladen
          </Button>
          {onRegenerateConfig && (
            <Button variant="outline" size="sm" onClick={onRegenerateConfig} disabled={regenerating} className="gap-2">
              {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {regenerating ? 'Config wird erstellt…' : 'Config neu erzeugen'}
            </Button>
          )}
          <Button size="sm" onClick={generatePdf} disabled={rendering || !hasConfig} className="gap-2">
            {rendering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            {rendering ? 'PDF wird erstellt…' : proposal.pdf_url ? 'PDF neu erzeugen' : 'PDF erzeugen'}
          </Button>
        </div>

        {error && <p className="text-xs text-destructive whitespace-pre-wrap">{error}</p>}

        {proposal.pdf_url && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" asChild>
              <a href={proposal.pdf_url} target="_blank" rel="noreferrer">
                <ExternalLink className="w-3.5 h-3.5" /> PDF öffnen
              </a>
            </Button>
            <Button variant="outline" size="sm" className="gap-2" asChild>
              <a href={proposal.pdf_url} download>
                <Download className="w-3.5 h-3.5" /> PDF herunterladen
              </a>
            </Button>
            {proposal.pdf_generated_at && (
              <span className="text-[11px] text-muted-foreground">
                Erzeugt am {new Date(proposal.pdf_generated_at).toLocaleString('de-AT')} · Version {proposal.version || 1}
              </span>
            )}
          </div>
        )}

        {hasConfig && (
          <div>
            <button onClick={() => setShowConfig(s => !s)} className="flex items-center gap-1 text-xs font-medium">
              {showConfig ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Config anzeigen
            </button>
            {showConfig && (
              <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-muted/50 p-3 text-[10px]">{configStr}</pre>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}