import React from 'react';

// Kennzahl im Projektkopf: kleine Bezeichnung, kräftiger Wert (optional „von …" leiser), Zusatz.
export default function KopfKennzahl({ label, value, von, hint, farbe, hintFarbe, tooltip, breit = false, children }) {
  const hintColor = hintFarbe || farbe;
  return (
    <div
      title={tooltip}
      className={`flex flex-col gap-0.5 px-[18px] py-3.5 min-w-0 ${breit ? 'flex-[1.4_1_220px]' : 'flex-[1_1_160px]'}`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      <span className="text-[20px] leading-7 font-bold text-foreground" style={farbe ? { color: farbe } : undefined}>
        {value}
        {von && <span className="text-sm font-medium text-muted-foreground"> {von}</span>}
      </span>
      {children}
      {hint && (
        <span className={`text-[13px] ${hintColor ? '' : 'text-muted-foreground'}`} style={hintColor ? { color: hintColor } : undefined}>
          {hint}
        </span>
      )}
    </div>
  );
}

// Rahmen der Kennzahlenleiste — Trennlinien zwischen den Feldern, umbrechend auf schmalen Bildschirmen
export function KopfKennzahlLeiste({ children }) {
  return (
    <div className="flex flex-wrap rounded border border-border bg-card [&>*:not(:last-child)]:border-r [&>*]:border-border/70">
      {children}
    </div>
  );
}
