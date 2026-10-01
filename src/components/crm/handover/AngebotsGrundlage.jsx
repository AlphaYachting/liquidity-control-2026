import React from 'react';
import { ExternalLink } from 'lucide-react';
import { QUELLEN } from '@/lib/crm/angebotsUmfang';
import { fmtDate } from '@/components/sprint/sprintConfig';

// "Grundlage: <Quelle> · Angebot <Nummer> vom <Datum>" + Link zum Angebot
export default function AngebotsGrundlage({ angebot }) {
  const teile = [`Grundlage: ${QUELLEN[angebot.quelle]}`];
  if (angebot.nummer || angebot.datum) {
    teile.push(`Angebot${angebot.nummer ? ` ${angebot.nummer}` : ''}${angebot.datum ? ` vom ${fmtDate(angebot.datum)}` : ''}`);
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-card px-3 py-2">
      <p className="text-sm">{teile.join(' · ')}</p>
      {angebot.url && (
        <a href={angebot.url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
          Angebot öffnen <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}