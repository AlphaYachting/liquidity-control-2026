import React from 'react';
import { Check } from 'lucide-react';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { tag } from '@/lib/neuigkeiten';

// Eine Ausgabe „Was ist neu" — dieselbe Darstellung im Fenster, im Archiv und in der Vorschau
export default function NeuigkeitInhalt({ ausgabe, kompakt = false }) {
  const punkte = (ausgabe?.punkte || []).filter((p) => p?.text);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className={kompakt ? 'text-[14px] font-semibold' : 'text-[17px] font-semibold'} style={{ color: RITTLER.black }}>
          {ausgabe?.titel || 'Was ist neu'}
        </h3>
        {ausgabe?.veroeffentlicht_am && (
          <span className="text-[12px] shrink-0" style={{ color: RITTLER.textSecondary }}>{tag(ausgabe.veroeffentlicht_am)}</span>
        )}
      </div>
      {punkte.length === 0 ? (
        <p className="mt-2 text-[13px]" style={{ color: RITTLER.textSecondary }}>Noch keine Punkte.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {punkte.map((p, i) => (
            <li key={i} className="flex gap-2.5 text-[13.5px] leading-snug" style={{ color: RITTLER.black }}>
              <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: STATUS_COLORS.done }} />
              <span>
                {p.text}
                {p.von && <span className="block text-[12px] mt-0.5" style={{ color: RITTLER.textSecondary }}>Wunsch von {p.von}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
