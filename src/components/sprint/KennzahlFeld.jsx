import React from 'react';
import { RITTLER } from '@/components/sprint/sprintConfig';

// W1 — Kennzahlenfeld: kleine Bezeichnung, dominanter Wert, Zusatz.
// Mit onClick wird das Feld zur Schaltfläche (z. B. Saldo → Seitenfenster); ohne bleibt es wie bisher.
export default function KennzahlFeld({ label, value, hint, valueColor, hintColor, tooltip, onClick, klickHinweis }) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={tooltip}
        className="flex-1 min-w-[140px] px-4 py-3 text-left rounded hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <p className="text-[11px] uppercase tracking-[1px]" style={{ color: RITTLER.textSecondary }}>{label}</p>
        <p className="text-[18px] font-bold" style={{ color: valueColor || RITTLER.black }}>{value}</p>
        {hint && <p className="text-[13px]" style={{ color: hintColor || RITTLER.textSecondary }}>{hint}</p>}
        {klickHinweis && <p className="text-[11.5px] underline mt-0.5" style={{ color: RITTLER.textSecondary }}>{klickHinweis}</p>}
      </button>
    );
  }
  return (
    <div className="flex-1 min-w-[140px] px-4 py-3" title={tooltip}>
      <p className="text-[11px] uppercase tracking-[1px]" style={{ color: RITTLER.textSecondary }}>{label}</p>
      <p className="text-[18px] font-bold" style={{ color: valueColor || RITTLER.black }}>{value}</p>
      {hint && <p className="text-[13px]" style={{ color: hintColor || RITTLER.textSecondary }}>{hint}</p>}
    </div>
  );
}