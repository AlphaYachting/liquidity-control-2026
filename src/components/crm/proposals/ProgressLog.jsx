import React from 'react';
import { Loader2, CheckCircle2, XCircle, TriangleAlert } from 'lucide-react';

// Zeigt live an, welche Schritte das System gerade ausführt (kleines Log),
// und bei Fehlern eine Analyse mit konkreten Handlungsempfehlungen.
export default function ProgressLog({ lines, error }) {
  if (!lines?.length && !error) return null;
  return (
    <div className="border rounded-xl bg-card p-4 space-y-3">
      {lines?.length > 0 && (
        <div className="space-y-1.5 font-mono text-xs">
          {lines.map((l, i) => (
            <div key={i} className="flex items-start gap-2">
              {l.status === 'running' && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0 mt-0.5" />}
              {l.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />}
              {l.status === 'error' && <XCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />}
              <span className={
                l.status === 'running' ? 'text-foreground font-medium'
                : l.status === 'error' ? 'text-destructive'
                : 'text-muted-foreground'
              }>
                {l.time} — {l.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
          <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
            <TriangleAlert className="w-3.5 h-3.5" /> Fehleranalyse
          </p>
          <p className="text-xs text-destructive">{error.message}</p>
          {error.advice?.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-foreground mb-1">Was zu tun ist:</p>
              <ul className="list-disc list-inside text-xs text-foreground/80 space-y-0.5">
                {error.advice.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Leitet aus der Fehlermeldung konkrete Handlungsempfehlungen ab.
export function analyzeError(e, stepLabel) {
  const msg = e?.message || String(e || 'Unbekannter Fehler');
  const advice = [];
  if (/502|504|timeout|network|fetch/i.test(msg)) {
    advice.push('Die KI-Anfrage hat zu lange gedauert oder die Verbindung wurde unterbrochen — einfach denselben Schritt erneut starten.');
    advice.push('Falls es wiederholt passiert: Gesprächsnotizen kürzen (z.B. irrelevante Passagen entfernen) und erneut versuchen.');
  } else if (/429|rate/i.test(msg)) {
    advice.push('Zu viele Anfragen in kurzer Zeit — 1–2 Minuten warten und den Schritt erneut starten.');
  } else if (/json|parse|schema|structure/i.test(msg)) {
    advice.push('Die KI-Antwort war nicht korrekt strukturiert — den Schritt einfach erneut starten, das behebt es meistens.');
    advice.push('Alternativ eine kurze Korrektur eingeben (z.B. "Bitte kompakter antworten") und überarbeiten lassen.');
  } else {
    advice.push(`Den Schritt "${stepLabel}" erneut starten — vorübergehende Fehler lösen sich oft beim zweiten Versuch.`);
    advice.push('Wenn der Fehler bestehen bleibt: Seite neu laden und erneut versuchen.');
  }
  advice.push('Bereits freigegebene Schritte bleiben erhalten — es geht nichts verloren.');
  return { message: `${stepLabel} fehlgeschlagen: ${msg}`, advice };
}