import React from 'react';
import Wochenbilanz from '@/components/sprint/Wochenbilanz';

// S9 — Steuerung: die Wochenbilanz steht vor allen Warnungen und Auslastungszahlen.
export default function SprintSteuerung() {
  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <h1 className="text-2xl font-extrabold uppercase tracking-tight text-[#2d2d2d]">Steuerung</h1>

      <Wochenbilanz />

      <div className="bg-white rounded-lg shadow-sm p-10 text-center">
        <p className="text-sm text-[#6b6b6b]">
          Auslastung, Liquiditätsvorschau, Sprint-Pipeline und Warnsignale folgen, sobald die
          Freigabe- und Rechnungslogik steht.
        </p>
      </div>
    </div>
  );
}