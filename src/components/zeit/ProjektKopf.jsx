import React from 'react';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { KATEGORIE_TEXT } from '@/lib/sprint/buchungsfelder';
import { kuerzeTitel } from '@/lib/zeit/projektTitel';

// Kunde und Projekt in einer Zeile — das Kürzel bleibt der Pille und der Trefferliste.
export default function ProjektKopf({ kunde, titel, kategorie, aufgabe, children }) {
  const kurz = kuerzeTitel(kunde, titel);
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
      {children}
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