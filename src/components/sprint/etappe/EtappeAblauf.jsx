import React, { useState } from 'react';
import { ArrowRight, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import Zustandskette from '@/components/sprint/Zustandskette';
import CountdownLeiste from '@/components/sprint/CountdownLeiste';
import { MILESTONE_STATES, STATE_LABELS, fmtDate } from '@/components/sprint/sprintConfig';
import { kurzDatum } from '@/lib/sprint/etappeKennzahlen';

const FOLGE = {
  produktion: 'Keine Kundenkommunikation.',
  pruefung: 'Keine Kundenkommunikation.',
  kundenfeedback: 'Startet die Kundenfrist und versendet die Übergabemail.',
};

// Ablauf einer Etappe: Zustandskette, Plan bzw. laufende Kundenfrist und der nächste Schritt
// mit seiner Folge. Ein Vorwärtssprung mit offenen Aufgaben fragt nach. Die Freigabe selbst
// läuft ausschließlich über den Bereich „Freigabe".
export default function EtappeAblauf({ milestone, sprint, openBefore, editierbar, onChange }) {
  const [frage, setFrage] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const state = milestone.state || 'input';
  const idx = MILESTONE_STATES.indexOf(state);
  const naechster = idx >= 0 && idx < 3 ? MILESTONE_STATES[idx + 1] : null;
  const vorheriger = idx > 0 && idx <= 3 ? MILESTONE_STATES[idx - 1] : null;
  const freigegeben = state === 'freigegeben';
  const mitCountdown = state === 'kundenfeedback' || freigegeben;

  const warnung = openBefore?.count > 0
    ? `In ${STATE_LABELS[openBefore.phase]} ${openBefore.count === 1 ? 'ist noch 1 Aufgabe' : `sind noch ${openBefore.count} Aufgaben`} offen`
    : null;

  const wechseln = async (ziel) => {
    setLaeuft(true);
    await onChange(ziel);
    setLaeuft(false);
  };
  const weiter = () => {
    if (warnung) { setFrage(true); return; }
    wechseln(naechster);
  };

  const plan = [
    `Übergabe ${kurzDatum(milestone.planned_handover)}`,
    `Freeze ${kurzDatum(milestone.planned_freeze)}`,
    sprint?.delivery_date ? `Lieferung des Projekts ${kurzDatum(sprint.delivery_date)}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <section className="flex flex-wrap items-center gap-x-8 gap-y-5 rounded border border-border bg-card px-5 py-[18px]">
      <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-3.5">
        <div className="max-w-[640px]">
          <Zustandskette state={state} />
        </div>
        {mitCountdown ? (
          <div className="max-w-[640px]">
            <CountdownLeiste
              handoverDate={milestone.handover_date || milestone.planned_handover}
              deadline={milestone.feedback_deadline || milestone.planned_freeze}
              state={state}
              approvedAt={milestone.released_at || milestone.updated_date}
            />
            {milestone.deadline_pulled_forward && (
              <p className="mt-1 text-xs text-muted-foreground">Frist auf den Liefertermin vorgezogen.</p>
            )}
          </div>
        ) : (
          <p className="m-0 text-[13px] text-muted-foreground">Plan: {plan}</p>
        )}
        {warnung && !freigegeben && (
          <p className="m-0 flex items-center gap-2 text-[13px] text-status-attention">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {warnung}
          </p>
        )}
      </div>

      <div className="flex flex-col items-start gap-1.5">
        {freigegeben && (
          <p className="m-0 max-w-[340px] text-[13px] text-status-done-text">
            Am {fmtDate(milestone.released_at || milestone.updated_date)} freigegeben. Aufgaben der Phase Kundenfeedback
            bleiben abschließbar, damit der Livegang möglich ist.
          </p>
        )}
        {!freigegeben && naechster && editierbar && (
          <>
            <Button
              onClick={weiter}
              disabled={laeuft}
              className="h-[38px] rounded bg-foreground px-4 text-sm font-semibold text-white hover:bg-foreground/90"
            >
              Weiter zu {STATE_LABELS[naechster]} <ArrowRight className="w-[15px] h-[15px] ml-1.5" />
            </Button>
            <span className="text-xs text-muted-foreground">{FOLGE[naechster]}</span>
          </>
        )}
        {!freigegeben && !naechster && (
          <span className="max-w-[300px] text-xs text-muted-foreground">Die Freigabe läuft über den Bereich „Freigabe“ unten.</span>
        )}
        {!freigegeben && vorheriger && editierbar && (
          <button
            type="button"
            disabled={laeuft}
            onClick={() => wechseln(vorheriger)}
            className="text-xs text-[#555555] hover:text-foreground hover:underline disabled:opacity-50"
          >
            Zurück zu {STATE_LABELS[vorheriger]}
          </button>
        )}
      </div>

      <Dialog open={frage} onOpenChange={setFrage}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{warnung}. Trotzdem weiter?</DialogTitle>
            <DialogDescription>Die Etappe trägt den Hinweis, bis die Aufgaben nachgezogen sind.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="rounded" onClick={() => setFrage(false)}>Abbrechen</Button>
            <Button
              className="rounded bg-foreground font-semibold text-white hover:bg-foreground/90"
              onClick={() => { setFrage(false); wechseln(naechster); }}
            >
              Trotzdem weiter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
