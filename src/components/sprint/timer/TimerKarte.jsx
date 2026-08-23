import React, { useState } from 'react';
import { Square, Coffee } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useProjektKontext } from '@/lib/sprint/useProjektKontext';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { letzteTaetigkeit } from '@/lib/zeit/taetigkeit';
import { dauerText, uhr } from '@/lib/zeit/tagesAuswertung';
import KategorieZeile from './KategorieZeile';
import BudgetZeile from './BudgetZeile';

const jetztMinute = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

// Laufender Timer: Uhr, Kontext, Pause und Stoppen mit Notiz.
export default function TimerKarte({ timer, label, schmal, onStop }) {
  const [busy, setBusy] = useState(false);
  const [notiz, setNotiz] = useState('');
  const [pausen, setPausen] = useState([]);
  const [pauseAb, setPauseAb] = useState(null);
  const { data: kontext } = useProjektKontext(timer.project_id);
  const taetigkeit = letzteTaetigkeit();

  const pausenMinuten = pausen.reduce((s, p) => s + (p.bis - p.von), 0);

  const pauseUmschalten = () => {
    if (pauseAb === null) setPauseAb(jetztMinute());
    else {
      setPausen((l) => [...l, { von: pauseAb, bis: Math.max(pauseAb, jetztMinute()) }]);
      setPauseAb(null);
    }
  };

  const stoppen = async () => {
    setBusy(true);
    const abzug = pausenMinuten + (pauseAb === null ? 0 : Math.max(0, jetztMinute() - pauseAb));
    await onStop(notiz, abzug);
    setBusy(false);
  };

  return (
    <div className="p-5">
      <p className="text-[11px] font-bold uppercase tracking-[2px]" style={{ color: RITTLER.textSecondary }}>
        Läuft
      </p>
      <p className="text-[15px] font-bold mt-1" style={{ color: RITTLER.black }}>
        {[timer.kuerzel, timer.projekt_titel || 'Projekt'].filter(Boolean).join(' · ')}
      </p>
      <KategorieZeile kategorie={kontext?.kategorie} />
      {taetigkeit && (
        <p className="text-[13px]" style={{ color: RITTLER.textSecondary }}>Tätigkeit: {taetigkeit}</p>
      )}
      {!schmal && <BudgetZeile budget={kontext?.budget} />}

      <p className="text-[40px] font-bold leading-none mt-3 tabular-nums" style={{ color: RITTLER.black }}>
        {label}
      </p>

      {(pausen.length > 0 || pauseAb !== null) && (
        <p className="text-xs mt-2" style={{ color: STATUS_COLORS.attention }}>
          {pauseAb !== null ? `Pause läuft seit ${uhr(pauseAb)}` : `Pause ${dauerText(pausenMinuten)} — wird abgezogen`}
        </p>
      )}

      <Input
        className="mt-3"
        placeholder="Notiz zur Buchung"
        value={notiz}
        onChange={(e) => setNotiz(e.target.value)}
      />

      <div className="flex gap-2 mt-3">
        <button
          type="button"
          disabled={busy}
          onClick={stoppen}
          className="flex-1 h-11 rounded flex items-center justify-center gap-2 text-white text-sm font-bold uppercase tracking-wide disabled:opacity-60"
          style={{ backgroundColor: RITTLER.pink }}
        >
          <Square className="w-4 h-4" /> Stoppen und buchen
        </button>
        <button
          type="button"
          onClick={pauseUmschalten}
          className="h-11 px-4 rounded border-[1.5px] text-sm font-bold uppercase flex items-center gap-1.5"
          style={{ borderColor: RITTLER.black, color: RITTLER.black }}
        >
          <Coffee className="w-4 h-4" /> {pauseAb === null ? 'Pause einlegen' : 'Pause beenden'}
        </button>
      </div>
    </div>
  );
}