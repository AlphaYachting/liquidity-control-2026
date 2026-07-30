import React, { useState } from 'react';
import { ArrowRight, ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { MILESTONE_STATES, STATE_LABELS, RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';

const CONSEQUENCE = {
  produktion: 'Keine Kundenkommunikation.',
  pruefung: 'Keine Kundenkommunikation.',
  kundenfeedback: 'Startet die Kundenfrist und versendet die Übergabemail.',
};

// U13 — Aktionsleiste: folgenreiche Klicks tragen ihre Folge im Text,
// Vorwärtssprung mit offenen Aufgaben erzeugt eine Rückfrage.
export default function MilestoneAktionsleiste({ state, openBefore, onChange }) {
  const [ask, setAsk] = useState(false);
  const idx = MILESTONE_STATES.indexOf(state);
  const next = idx >= 0 && idx < 3 ? MILESTONE_STATES[idx + 1] : null;
  const prev = idx > 0 && idx <= 3 ? MILESTONE_STATES[idx - 1] : null;
  const warning = openBefore?.count > 0
    ? `In ${STATE_LABELS[openBefore.phase]} ${openBefore.count === 1 ? 'ist noch 1 Aufgabe' : `sind noch ${openBefore.count} Aufgaben`} offen`
    : null;

  const forward = () => {
    if (warning) { setAsk(true); return; }
    onChange(next);
  };

  return (
    <div className="sticky bottom-0 z-20 bg-white border-t" style={{ borderColor: RITTLER.line }}>
      <div className="max-w-[1200px] mx-auto px-4 py-4">
        {warning && (
          <p className="flex items-center gap-2 text-sm mb-2" style={{ color: STATUS_COLORS.attention }}>
            <AlertTriangle className="w-4 h-4" /> {warning}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {prev && (
            <Button variant="outline" size="sm" className="rounded border-[1.5px] border-[#2d2d2d] text-[#2d2d2d]" onClick={() => onChange(prev)}>
              <ArrowLeft className="w-4 h-4" /> Zurück zu {STATE_LABELS[prev]}
            </Button>
          )}
          {next && (
            <Button
              className="bg-[#ff3764] hover:bg-[#d12d52] text-white font-bold uppercase rounded"
              onClick={forward}
            >
              Weiter zu {STATE_LABELS[next]} <ArrowRight className="w-4 h-4" />
            </Button>
          )}
          {!next && (
            <p className="text-sm" style={{ color: RITTLER.textSecondary }}>
              Die Freigabe läuft ausschließlich über die eigene Freigabe-Aktion.
            </p>
          )}
        </div>
        {next && (
          <p className="text-[13px] mt-2" style={{ color: RITTLER.textSecondary }}>{CONSEQUENCE[next]}</p>
        )}
      </div>

      <Dialog open={ask} onOpenChange={setAsk}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{warning}. Trotzdem weiter?</DialogTitle>
            <DialogDescription>
              Die Etappe trägt den Hinweis, bis die Aufgaben nachgezogen sind.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="rounded border-[1.5px] border-[#2d2d2d] text-[#2d2d2d]" onClick={() => setAsk(false)}>
              Abbrechen
            </Button>
            <Button
              className="bg-[#ff3764] hover:bg-[#d12d52] text-white font-bold uppercase rounded"
              onClick={() => { setAsk(false); onChange(next); }}
            >
              Trotzdem weiter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}