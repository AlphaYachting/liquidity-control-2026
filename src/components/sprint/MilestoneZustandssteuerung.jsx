import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowLeft, CheckCheck } from 'lucide-react';
import Zustandskette from '@/components/sprint/Zustandskette';
import { MILESTONE_STATES, STATE_LABELS } from '@/components/sprint/sprintConfig';

// Zustandssteuerung K2: vor und zurück nur zwischen den Zuständen 1 bis 4,
// kein Überspringen, "freigegeben" ausschließlich über die Freigabe-Aktion.
export default function MilestoneZustandssteuerung({ state, phaseDone, onChange }) {
  const idx = MILESTONE_STATES.indexOf(state);
  const canForward = idx >= 0 && idx < 3;
  const canBack = idx > 0 && idx <= 3;
  const next = canForward ? MILESTONE_STATES[idx + 1] : null;
  const prev = canBack ? MILESTONE_STATES[idx - 1] : null;

  const handleSelect = (target) => {
    const t = MILESTONE_STATES.indexOf(target);
    if (t === idx || t > 3 || idx > 3) return;
    if (Math.abs(t - idx) !== 1) return;
    onChange(target);
  };

  return (
    <div className="space-y-4">
      {phaseDone && next && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded border border-[#e5e5e5] bg-[#f5f5f5] px-4 py-3">
          <CheckCheck className="w-4 h-4 text-[#2d2d2d] shrink-0" />
          <p className="flex-1 text-sm text-[#2d2d2d]">
            Alle Aufgaben der Phase {STATE_LABELS[state]} sind erledigt. Weiter zu {STATE_LABELS[next]}?
          </p>
          <Button
            size="sm"
            className="bg-[#ff3764] hover:bg-[#e62e58] text-white font-bold uppercase rounded"
            onClick={() => onChange(next)}
          >
            Weiter
          </Button>
        </div>
      )}

      <div className="max-w-md">
        <Zustandskette state={state} onSelect={idx <= 3 ? handleSelect : undefined} />
      </div>

      <div className="flex flex-wrap gap-2">
        {prev && (
          <Button variant="outline" size="sm" className="rounded" onClick={() => onChange(prev)}>
            <ArrowLeft className="w-4 h-4" /> Zurück zu {STATE_LABELS[prev]}
          </Button>
        )}
        {next && (
          <Button
            size="sm"
            className="bg-[#ff3764] hover:bg-[#e62e58] text-white font-bold uppercase rounded"
            onClick={() => onChange(next)}
          >
            Weiter zu {STATE_LABELS[next]} <ArrowRight className="w-4 h-4" />
          </Button>
        )}
        {state === 'kundenfeedback' && (
          <p className="text-xs text-[#999999] self-center">
            Die Freigabe läuft ausschließlich über die Freigabe-Aktion, nicht über die Kette.
          </p>
        )}
      </div>
    </div>
  );
}