import React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

const uhrzeit = (iso) => (iso ? new Date(iso).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }) : '');

// Kleine Zeile über einer Anweisungsliste: wann der sevDesk-Stand zuletzt live geprüft wurde.
// Erscheint nur, wenn es offene Anweisungen mit sevDesk-Beleg gibt.
export default function SevdeskAbgleichHinweis({ abgleich }) {
  if (!abgleich || abgleich.offen === 0) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {abgleich.laeuft ? (
        <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> sevDesk-Stand wird geprüft…</span>
      ) : abgleich.fehler ? (
        <span className="text-status-attention">sevDesk-Stand nicht abrufbar — es gilt der letzte automatische Abgleich.</span>
      ) : abgleich.geprueftAm ? (
        <span>sevDesk-Stand geprüft um {uhrzeit(abgleich.geprueftAm)}</span>
      ) : null}
      {!abgleich.laeuft && (
        <button type="button" onClick={abgleich.jetztAbgleichen}
          className="flex items-center gap-1 hover:text-foreground underline-offset-2 hover:underline">
          <RefreshCw className="w-3 h-3" /> jetzt prüfen
        </button>
      )}
    </div>
  );
}
