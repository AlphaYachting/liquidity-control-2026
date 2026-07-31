import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Receipt } from 'lucide-react';
import Wochenbilanz from '@/components/sprint/Wochenbilanz';

// S9 — Steuerung: die Wochenbilanz steht vor allen Warnungen und Auslastungszahlen.
export default function SprintSteuerung() {
  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <h1 className="text-2xl font-extrabold uppercase tracking-tight text-[#2d2d2d]">Steuerung</h1>

      <Wochenbilanz />

      <Link
        to="/sprint/rechnungsuebergabe"
        className="flex items-center gap-3 bg-white rounded-lg border border-[#e0e0e0] px-4 py-4 hover:bg-[#fafafa]"
      >
        <Receipt className="w-5 h-5 text-[#2d2d2d]" />
        <div className="flex-1">
          <p className="text-[15px] font-bold text-[#2d2d2d]">Rechnungsübergabe</p>
          <p className="text-[13px] text-[#6b6b6b]">Freigegebene Etappen, die noch nicht in SEF erfasst sind</p>
        </div>
        <ArrowRight className="w-4 h-4 text-[#6b6b6b]" />
      </Link>

      <div className="bg-white rounded-lg shadow-sm p-10 text-center">
        <p className="text-sm text-[#6b6b6b]">
          Auslastung, Liquiditätsvorschau, Sprint-Pipeline und Warnsignale folgen, sobald die
          Freigabe- und Rechnungslogik steht.
        </p>
      </div>
    </div>
  );
}