import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Receipt } from 'lucide-react';
import Wochenbilanz from '@/components/sprint/Wochenbilanz';
import TageslaufPanel from '@/components/sprint/TageslaufPanel';

// S9 — Steuerung: die Wochenbilanz steht vor allen Warnungen und Auslastungszahlen.
export default function SprintSteuerung() {
  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <h1 className="text-2xl font-extrabold uppercase tracking-tight text-foreground">Steuerung</h1>

      <Wochenbilanz />

      <Link
        to="/sprint/rechnungsuebergabe"
        className="flex items-center gap-3 bg-white rounded-lg border border-border px-4 py-4 hover:bg-[#fafafa]"
      >
        <Receipt className="w-5 h-5 text-foreground" />
        <div className="flex-1">
          <p className="text-[15px] font-bold text-foreground">Rechnungsübergabe</p>
          <p className="text-[13px] text-muted-foreground">Freigegebene Etappen, die noch nicht in SEF erfasst sind</p>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground" />
      </Link>

      <TageslaufPanel />
    </div>
  );
}