import React from 'react';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { zeitfensterLabel } from '@/lib/zeit/eingabeParser';
import { dauerText, MODELL_TEXT } from '@/lib/zeit/tagesAuswertung';

// Was verstanden wurde — ein Satz in Klartext, darunter eine Zeile Zusatz.
export default function VorschauSatz({ projekt, fenster, minuten, notiz, taetigkeit }) {
  const projektText = projekt ? [projekt.clientName, projekt.title].filter(Boolean).join(' · ') : '';
  const unvollstaendig = !projekt || minuten <= 0;

  let satz;
  if (!projekt && minuten <= 0) satz = 'Welches Projekt?';
  else if (!projekt) satz = `${dauerText(minuten)} — welches Projekt?`;
  else if (minuten <= 0) satz = `${projektText} — wie lange?`;
  else {
    const fensterTeil = fenster ? `, ${zeitfensterLabel(fenster).replace('–', ' bis ')}` : '';
    const notizTeil = notiz ? ` — „${notiz}"` : '';
    satz = `${dauerText(minuten)} auf ${projektText}${fensterTeil}${notizTeil}`;
  }

  const modell = projekt?.abrechnungsmodell || null;
  const betrag = modell === 'aufwand' && projekt?.stundensatz && minuten
    ? Math.round((minuten / 60) * projekt.stundensatz)
    : null;
  const zusatz = projekt
    ? [
      MODELL_TEXT[modell] || 'Zeitbuchung',
      modell === 'intern' ? 'nicht verrechenbar' : 'wird fakturiert',
      taetigkeit || null,
      betrag !== null ? `€ ${betrag}` : null,
    ].filter(Boolean).join(' · ')
    : '';

  return (
    <div className="mt-2">
      <p className="text-sm font-medium" style={{ color: unvollstaendig ? STATUS_COLORS.attention : RITTLER.black }}>
        {satz}
      </p>
      {zusatz && <p className="text-xs mt-0.5" style={{ color: RITTLER.textSecondary }}>{zusatz}</p>}
    </div>
  );
}