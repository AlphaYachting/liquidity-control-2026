import React from 'react';
import { RITTLER } from '@/components/sprint/sprintConfig';

// W1 — Kennzahlenfeld: kleine Bezeichnung, dominanter Wert, Zusatz.
export default function KennzahlFeld({ label, value, hint, valueColor, hintColor, tooltip }) {
  return (
    <div className="flex-1 min-w-[140px] px-4 py-3" title={tooltip}>
      <p className="text-[11px] uppercase tracking-[1px]" style={{ color: RITTLER.textSecondary }}>{label}</p>
      <p className="text-[18px] font-bold" style={{ color: valueColor || RITTLER.black }}>{value}</p>
      {hint && <p className="text-[13px]" style={{ color: hintColor || RITTLER.textSecondary }}>{hint}</p>}
    </div>
  );
}