import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, FileUp, FileText } from 'lucide-react';
import { suggestModuleId } from '@/lib/crm/handoverCommit';

const SCHEMA = {
  type: 'object',
  properties: {
    customer_name: { type: 'string' },
    offer_number: { type: 'string' },
    total_net: { type: 'number' },
    positions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          amount: { type: 'number', description: 'Netto-Gesamtbetrag der Position in EUR' },
          optional: { type: 'boolean' },
        },
      },
    },
  },
};

// Isoliertes Zusatzmodul: ein extern erstelltes Angebot (PDF) wird angehängt und
// ausgelesen. Ergebnis füllt nur die Positionszeilen des Übergabeblatts vor.
export default function ExternesAngebotLeser({ deal, modules = [], onRows }) {
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [gelesen, setGelesen] = useState(null);
  const url = deal?.externes_angebot_url;

  const verarbeiten = async (file) => {
    setBusy(true);
    setFehler(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      const res = await base44.integrations.Core.ExtractDataFromUploadedFile({ file_url, json_schema: SCHEMA });
      if (res?.status !== 'success' || !res.output) {
        setFehler(res?.details || 'Das Angebot konnte nicht gelesen werden.');
        return;
      }
      const daten = Array.isArray(res.output) ? res.output[0] : res.output;
      const positionen = (daten?.positions || []).filter((p) => p?.name);
      setGelesen({ ...daten, positions: positionen, file_url, file_name: file.name });
      await base44.entities.CrmDeal.update(deal.id, {
        externes_angebot_url: file_url,
        externes_angebot_json: JSON.stringify({ ...daten, positions: positionen, file_name: file.name }),
      });
      onRows?.(positionen.map((p) => ({
        name: p.name,
        amount: p.amount ? String(p.amount) : '',
        module_choice: suggestModuleId(p.name, modules) || '',
      })));
    } catch (e) {
      setFehler(e.message || 'Unerwarteter Fehler beim Einlesen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-muted-foreground" />
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Externes Angebot einlesen</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Angebots-PDF aus dem externen Werkzeug anhängen — die Positionen werden gelesen und unten vorbefüllt.
      </p>
      <div className="flex items-center gap-2">
        <label>
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            className="hidden"
            disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) verarbeiten(f); e.target.value = ''; }}
          />
          <Button asChild variant="outline" size="sm" disabled={busy}>
            <span className="cursor-pointer">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
              {busy ? 'Wird gelesen…' : 'Angebot anhängen'}
            </span>
          </Button>
        </label>
        {(gelesen?.file_url || url) && (
          <a href={gelesen?.file_url || url} target="_blank" rel="noreferrer" className="text-xs underline text-muted-foreground">
            angehängtes Angebot öffnen
          </a>
        )}
      </div>
      {gelesen && (
        <p className="text-xs text-muted-foreground">
          {gelesen.positions.length} Position(en) gelesen{gelesen.offer_number ? ` · Angebot ${gelesen.offer_number}` : ''}
          {gelesen.total_net ? ` · Summe netto ${gelesen.total_net}` : ''} — bitte unten prüfen.
        </p>
      )}
      {fehler && <p className="text-xs text-destructive">{fehler}</p>}
    </div>
  );
}