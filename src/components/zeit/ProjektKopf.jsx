import React from 'react';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { KATEGORIE_TEXT } from '@/lib/sprint/buchungsfelder';

// Der Projektname ist hier Bestätigung, nicht Information — deshalb leise und einzeilig.
export default function ProjektKopf({ kunde, titel, kategorie, aufgabe }) {
  // Kürzung des Projekttitels um den Kundennamen bleibt wie gehabt.
  const kurz = kunde && titel?.toLowerCase().startsWith(kunde.toLowerCase())
    ? titel.slice(kunde.length).replace(/^[\s—·-]+/, '')
    : titel;
  const voll = [kunde, kurz].filter(Boolean).join(' · ');

  return (
    <div>
      <p className="text-[13.5px] truncate" title={voll}>
        {kunde && <span style={{ color: RITTLER.textSecondary }}>{kunde} · </span>}
        <span className="font-semibold" style={{ color: RITTLER.black }}>{kurz || 'Projekt'}</span>
      </p>
      {kategorie && (
        <p className="text-[11.5px] mt-0.5" style={{ color: RITTLER.textSecondary }}>
          {KATEGORIE_TEXT[kategorie] || kategorie}
        </p>
      )}
      {aufgabe && (
        <p
          className="text-[12.5px] mt-1 pl-2 truncate"
          title={aufgabe}
          style={{ borderLeft: `2px solid ${RITTLER.line}`, color: RITTLER.textSecondary }}
        >
          Aufgabe „{aufgabe}“
        </p>
      )}
    </div>
  );
}