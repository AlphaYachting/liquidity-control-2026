import React from 'react';

// S9/S10 — Steuerung: Auslastung, Liquidität, Warnsignale (Ausbaustufe Block C/D)
export default function SprintSteuerung() {
  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <h1 className="text-2xl font-extrabold uppercase tracking-tight text-[#2d2d2d]">Steuerung</h1>
      <div className="bg-white rounded-lg shadow-sm p-10 text-center">
        <p className="text-sm text-[#2d2d2d] font-medium">Auslastung, Liquiditätsvorschau und Warnsignale folgen in der nächsten Ausbaustufe.</p>
        <p className="text-xs text-[#6b6b6b] mt-1">Zuerst Fundament abnehmen: Katalog, Sprint anlegen, Focus-Tage, Zeitbuchung.</p>
      </div>
    </div>
  );
}