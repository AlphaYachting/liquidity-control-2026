import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ExternalLink, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '@/lib/liquidityUtils';

const ART = {
  stimmt: { label: 'Stimmt', color: 'bg-emerald-100 text-emerald-700' },
  abweichung: { label: 'Status weicht ab', color: 'bg-amber-100 text-amber-800' },
  beleg_in_sevdesk_nicht_vorhanden: { label: 'Beleg in sevDesk nicht vorhanden', color: 'bg-red-100 text-red-700' },
  ohne_beleg_eindeutiger_kandidat: { label: 'Rechnung eindeutig zuordenbar', color: 'bg-blue-100 text-blue-700' },
  ohne_beleg_mehrere_kandidaten: { label: 'Mehrere Rechnungen möglich', color: 'bg-amber-100 text-amber-800' },
  ohne_beleg_kein_kandidat: { label: 'Keine Rechnung in sevDesk', color: 'bg-gray-100 text-gray-600' },
  pruefung_fehlgeschlagen: { label: 'Prüfung fehlgeschlagen', color: 'bg-red-100 text-red-700' },
};

const STATUS_TEXT = {
  draft: 'Entwurf', ready_for_backoffice: 'Bereit', sent_to_backoffice: 'An Backoffice gesendet',
  invoice_created: 'Rechnung erstellt', paid: 'Bezahlt', blocked: 'Blockiert', cancelled: 'Storniert',
};

// Eine geprüfte Anweisung: was die App sagt, was sevDesk sagt, und was daraus folgt.
export default function SevdeskAbgleichZeile({ fall, onAngleichen, laeuft }) {
  const art = ART[fall.art] || ART.pruefung_fehlgeschlagen;
  const angleichbar = !!fall.vorschlag;

  return (
    <div className="border rounded-lg p-3 bg-card space-y-1.5">
      <div className="flex items-start gap-2 flex-wrap">
        <Badge className={`text-xs ${art.color}`}>{art.label}</Badge>
        <span className="text-sm font-medium">{fall.kunde || '—'}</span>
        <span className="text-xs text-muted-foreground">{fall.projekt}</span>
        <span className="ml-auto text-sm font-semibold">{formatCurrency(fall.netto)} netto</span>
      </div>

      <p className="text-xs text-muted-foreground">
        App: <span className="font-medium text-foreground">{STATUS_TEXT[fall.status_app] || fall.status_app}</span>
        {fall.rechnungsnummer && <> · sevDesk: {fall.rechnungsnummer}</>}
        {fall.rechnungsdatum && <> vom {fall.rechnungsdatum}</>}
        {typeof fall.sevdesk_netto === 'number' && fall.abweichungen?.includes('betrag') && (
          <> · sevDesk-Netto: <span className="text-red-700 font-medium">{formatCurrency(fall.sevdesk_netto)}</span></>
        )}
        {fall.quelle && <> · Quelle: {fall.quelle}</>}
      </p>

      {fall.begruendung && <p className="text-xs text-muted-foreground italic">{fall.begruendung}</p>}

      {fall.kandidaten?.length > 1 && (
        <ul className="text-xs text-muted-foreground list-disc pl-4">
          {fall.kandidaten.map((k) => (
            <li key={k.record_id}>{k.rechnungsnummer} · {k.rechnungsdatum} · {formatCurrency(k.netto)} · {k.zahlstatus}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 pt-0.5">
        {angleichbar && (
          <Button size="sm" className="h-7 text-xs" disabled={laeuft} onClick={() => onAngleichen(fall)}>
            {laeuft ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Auf sevDesk-Stand bringen'}
          </Button>
        )}
        {angleichbar && fall.vorschlag.status && (
          <span className="text-xs text-muted-foreground">
            → {STATUS_TEXT[fall.vorschlag.status] || fall.vorschlag.status}
            {fall.vorschlag.sevdesk_invoice_id ? ' + Rechnung verknüpfen' : ''}
            {fall.vorschlag.sevdesk_invoice_id === null && fall.art === 'beleg_in_sevdesk_nicht_vorhanden' ? ' + Verknüpfung lösen' : ''}
          </span>
        )}
        {fall.art === 'stimmt' && (
          <span className="text-xs text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> nichts zu tun</span>
        )}
        {fall.sevdesk_invoice_id && (
          <a href={`https://my.sevdesk.de/#/fi/${fall.sevdesk_invoice_id}`} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline flex items-center gap-1 ml-auto">
            <ExternalLink className="w-3 h-3" /> in sevDesk
          </a>
        )}
      </div>
    </div>
  );
}