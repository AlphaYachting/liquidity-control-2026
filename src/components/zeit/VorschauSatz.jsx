import React from 'react';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { dauerText } from '@/lib/zeit/tagesAuswertung';

// Ein Satz sagt, was verstanden wurde. Nichts sonst im Fenster sagt es noch einmal.
export default function VorschauSatz({ projekt, minuten, notiz, eingabe }) {
  const projektText = projekt ? [projekt.clientName, projekt.title].filter(Boolean).join(' · ') : '';
  const klar = !!projekt && minuten > 0;

  const betrag = projekt?.abrechnungsmodell === 'aufwand' && projekt?.stundensatz && minuten > 0
    ? Math.round((minuten / 60) * projekt.stundensatz)
    : null;

  let inhalt;
  if (klar) {
    inhalt = (
      <>
        <span className="font-semibold">{dauerText(minuten)} auf {projektText}</span>
        {notiz && <> — „{notiz}"</>}
      </>
    );
  } else if (projekt) {
    inhalt = <span className="font-semibold">{projektText}</span>;
  } else if (eingabe) {
    inhalt = <>Kein Projekt zu {eingabe} gefunden.</>;
  } else {
    inhalt = <>Noch nichts erkannt.</>;
  }

  return (
    <div
      className="mt-2 pl-2.5"
      style={{ borderLeft: `2.5px solid ${klar ? RITTLER.pink : RITTLER.line}` }}
    >
      <p className="text-[13px]" style={{ color: klar ? RITTLER.black : RITTLER.textSecondary }}>
        {inhalt}
      </p>
      {betrag !== null && (
        <p className="text-[11.5px] mt-0.5" style={{ color: RITTLER.textSecondary }}>
          nach Aufwand: € {betrag}
        </p>
      )}
    </div>
  );
}