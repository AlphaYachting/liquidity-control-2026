import React from 'react';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { zeitfensterLabel, dauerLabel } from '@/lib/zeit/eingabeParser';

const MODELL_TEXT = {
  sprint: 'Sprintprojekt',
  support: 'Supportprojekt',
  aufwand: 'Nach Aufwand',
  paket: 'Pauschalpaket',
  intern: 'Interne Arbeit',
};

const Etikett = ({ children, warnung }) => (
  <span
    className="text-[11px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
    style={{
      backgroundColor: warnung ? 'hsl(var(--status-critical-surface))' : RITTLER.surface,
      color: warnung ? 'hsl(var(--status-critical))' : RITTLER.textSecondary,
    }}
  >
    {children}
  </span>
);

// Was verstanden wurde — bevor gebucht wird.
export default function VorschauEtiketten({ projekt, fenster, minuten, notiz }) {
  const modell = projekt?.abrechnungsmodell || 'aufwand';
  const betrag = modell === 'aufwand' && projekt?.stundensatz && minuten
    ? Math.round((minuten / 60) * projekt.stundensatz)
    : null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {projekt
        ? <Etikett>{[projekt.clientName, projekt.title].filter(Boolean).join(' · ')}</Etikett>
        : <Etikett warnung>Projekt fehlt</Etikett>}
      {fenster && <Etikett>{zeitfensterLabel(fenster)}</Etikett>}
      {minuten > 0 ? <Etikett>{dauerLabel(minuten)}</Etikett> : <Etikett warnung>Dauer fehlt</Etikett>}
      {notiz && <Etikett>{notiz}</Etikett>}
      {projekt && <Etikett>{MODELL_TEXT[modell]}</Etikett>}
      {betrag !== null && <Etikett>{betrag} EUR</Etikett>}
    </div>
  );
}