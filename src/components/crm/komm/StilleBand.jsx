import React from 'react';
import { Button } from '@/components/ui/button';
import { eurLabel, dateLabel } from './kommConfig';

// Hinweis auf Stille nach der Angebotsübermittlung — nicht schließbar, ohne Animation.
export default function StilleBand({ stille, wiedervorlage, onNachfassen }) {
  return (
    <div className="bg-status-critical-surface border-b border-border px-4 py-3 flex gap-3">
      <span className="w-[3px] self-stretch bg-primary rounded-sm shrink-0" />
      <div className="min-w-0">
        <p className="text-[13px] text-foreground">
          Seit <span className="font-semibold">{stille.tage} Tagen</span> keine Rückmeldung auf das Angebot.
        </p>
        <p className="text-xs text-muted-foreground">
          „{stille.titel}" · {eurLabel(stille.summe)} netto · übermittelt am {dateLabel(stille.gesendet_am)}.
          {wiedervorlage ? ` Wiedervorlage war der ${dateLabel(wiedervorlage)}.` : ''}
        </p>
      </div>
      <Button size="sm" onClick={onNachfassen} className="ml-auto self-center bg-primary shrink-0">
        Jetzt nachfassen
      </Button>
    </div>
  );
}