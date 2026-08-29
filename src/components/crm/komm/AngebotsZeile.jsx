import React from 'react';
import { eurLabel, dateLabel } from './kommConfig';

// Bezugszeile zum verknüpften Angebot — Titel, Summe, PDF-Lage bzw. Versanddatum.
export default function AngebotsZeile({ angebot, gesendetAm, tage }) {
  if (!angebot) return null;
  const zusatz = gesendetAm
    ? `${eurLabel(angebot.summe_netto)} netto · übermittelt am ${dateLabel(gesendetAm)}${tage != null ? ` · vor ${tage} Tagen` : ''}`
    : `${eurLabel(angebot.summe_netto)} netto · ${angebot.hat_pdf ? 'PDF liegt vor' : 'kein PDF — Preise stehen in der Mail'}`;

  return (
    <div className="border border-border rounded-lg bg-muted/40 px-3.5 py-3 flex items-center gap-3.5 flex-wrap">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold truncate">{angebot.titel}</p>
        <p className="text-xs text-muted-foreground tabular-nums">{zusatz}</p>
      </div>
    </div>
  );
}