import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileText, ChevronDown, ChevronRight } from 'lucide-react';

export default function RenderPanel({ proposal, config }) {
  const [showConfig, setShowConfig] = useState(false);
  const configStr = config ? JSON.stringify(config, null, 2) : '';

  const downloadConfig = () => {
    const blob = new Blob([configStr], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `angebot_config_${proposal.customer_company || proposal.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Schritt 4 — Render-Config & PDF</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={downloadConfig} disabled={!config} className="gap-2">
            <Download className="w-3.5 h-3.5" /> Config-JSON herunterladen
          </Button>
          <Button size="sm" disabled className="gap-2">
            <FileText className="w-3.5 h-3.5" /> PDF erzeugen
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Der Python-Render-Service (generate_proposal.py) ist noch nicht verbunden. Bis dahin kann die
          fertige Config heruntergeladen und manuell (z.B. in claude.ai) gerendert werden. Sobald der
          Render-Service steht, wird „PDF erzeugen" hier aktiviert.
        </p>
        {proposal.pdf_url && (
          <a href={proposal.pdf_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
            Fertiges PDF öffnen
          </a>
        )}
        {config && (
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