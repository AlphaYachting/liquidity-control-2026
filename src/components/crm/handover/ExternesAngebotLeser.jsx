import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, FileUp, FileText, RefreshCw } from 'lucide-react';

const WOERTLICH = 'Wörtlich aus dem Angebot übernehmen, nicht umformulieren';

const SCHEMA = {
  type: 'object',
  properties: {
    customer_name: { type: 'string' },
    offer_number: { type: 'string' },
    offer_date: { type: 'string', description: 'Angebotsdatum im Format JJJJ-MM-TT' },
    total_net: { type: 'number' },
    leistungszeitraum: { type: 'string', description: `Vereinbarte Dauer bzw. Zeitplan. ${WOERTLICH}` },
    liefertermin: { type: 'string', description: 'Liefer- oder Fertigstellungstermin im Format JJJJ-MM-TT, falls genannt' },
    korrekturschleifen: { type: 'number', description: 'Anzahl Korrekturschleifen je Leistungspaket, falls genannt' },
    mehrkosten_regel: { type: 'string', description: `Wie Mehraufwand verrechnet wird. ${WOERTLICH}` },
    nicht_enthalten: { type: 'array', items: { type: 'string' }, description: `Ausdrücklich nicht enthaltene Leistungen. ${WOERTLICH}` },
    zahlungsbedingungen: { type: 'string', description: WOERTLICH },
    anzahlung_prozent: { type: 'number' },
    positions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          amount: { type: 'number', description: 'Netto-Gesamtbetrag der Position in EUR' },
          optional: { type: 'boolean' },
          description: { type: 'string', description: `Leistungsbeschreibung. ${WOERTLICH}` },
          lieferumfang: { type: 'array', items: { type: 'string' }, description: `Einzelleistungen der Position. ${WOERTLICH}` },
          korrekturschleifen: { type: 'number', description: 'nur falls für diese Position genannt' },
          leistungszeitraum: { type: 'string' },
          abrechnung: { type: 'string', enum: ['einmalig', 'monatlich', 'nach Aufwand'] },
        },
      },
    },
  },
};

// Isoliertes Zusatzmodul: ein extern erstelltes Angebot (PDF) wird angehängt und
// ausgelesen. Auch während der Lead-Bearbeitung nutzbar: dann ohne onGelesen — das
// gelesene Angebot bleibt am Deal und wird im Übergabeblatt automatisch übernommen.
export default function ExternesAngebotLeser({ deal, onGelesen, onSaved, rahmen = true }) {
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [gelesen, setGelesen] = useState(() => {
    try { return deal?.externes_angebot_json ? JSON.parse(deal.externes_angebot_json) : null; } catch { return null; }
  });
  const url = gelesen?.file_url || deal?.externes_angebot_url;

  const lesen = async (file_url, file_name) => {
    setBusy(true);
    setFehler(null);
    try {
      const res = await base44.integrations.Core.ExtractDataFromUploadedFile({ file_url, json_schema: SCHEMA });
      if (res?.status !== 'success' || !res.output) {
        setFehler(res?.details || 'Das Angebot konnte nicht gelesen werden.');
        return;
      }
      const daten = Array.isArray(res.output) ? res.output[0] : res.output;
      const json = { ...daten, positions: (daten?.positions || []).filter((p) => p?.name), file_name, schema_version: 2 };
      setGelesen({ ...json, file_url });
      await base44.entities.CrmDeal.update(deal.id, {
        externes_angebot_url: file_url,
        externes_angebot_json: JSON.stringify(json),
        ...(!(deal.value_net > 0) && daten?.total_net > 0 ? { value_net: daten.total_net } : {}),
      });
      onSaved?.();
      onGelesen?.(json, file_url);
    } catch (e) {
      setFehler(e.message || 'Unerwarteter Fehler beim Einlesen.');
    } finally {
      setBusy(false);
    }
  };

  const hochladen = async (file) => {
    setBusy(true);
    const { file_url } = await base44.integrations.Core.UploadPublicFile({ file }).finally(() => setBusy(false));
    await lesen(file_url, file.name);
  };

  return (
    <div className={rahmen ? 'rounded-lg border p-3 space-y-2' : 'space-y-2'}>
      {rahmen && (
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Externes Angebot einlesen</p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Angebots-PDF aus dem externen Werkzeug anhängen — Positionen und Umfang werden gelesen und
        {onGelesen ? ' unten vorbefüllt.' : ' später im Übergabeblatt automatisch übernommen.'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label>
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            className="hidden"
            disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) hochladen(f); e.target.value = ''; }}
          />
          <Button asChild variant="outline" size="sm" disabled={busy}>
            <span className="cursor-pointer">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
              {busy ? 'Wird gelesen…' : 'Angebot anhängen'}
            </span>
          </Button>
        </label>
        {url && gelesen?.schema_version !== 2 && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => lesen(url, gelesen?.file_name || '')}>
            <RefreshCw className="w-4 h-4" /> Angebot neu einlesen
          </Button>
        )}
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="text-xs underline text-muted-foreground">
            angehängtes Angebot öffnen
          </a>
        )}
      </div>
      {gelesen && (
        <p className="text-xs text-muted-foreground">
          {(gelesen.positions || []).length} Position(en) gelesen{gelesen.offer_number ? ` · Angebot ${gelesen.offer_number}` : ''}
          {gelesen.total_net ? ` · Summe netto ${gelesen.total_net}` : ''}{onGelesen ? ' — bitte unten prüfen.' : ''}
        </p>
      )}
      {fehler && <p className="text-xs text-destructive">{fehler}</p>}
    </div>
  );
}