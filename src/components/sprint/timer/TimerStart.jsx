import React, { useState } from 'react';
import { Play } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useProjektKontext } from '@/lib/sprint/useProjektKontext';
import { bucheZeit, zeitLabel } from '@/lib/sprint/useTimer';
import { RITTLER } from '@/components/sprint/sprintConfig';
import ProjektWahl from './ProjektWahl';
import KategorieZeile from './KategorieZeile';
import BudgetZeile from './BudgetZeile';

const REITER = [{ key: 'timer', label: 'Timer' }, { key: 'manuell', label: 'Manuell' }];

// Ruhezustand im Sprint-Modul: Timer starten oder Stunden manuell buchen.
export default function TimerStart({ email, onStart, onBooked }) {
  const [reiter, setReiter] = useState('timer');
  const [projekt, setProjekt] = useState(null);
  const [kuerzel, setKuerzel] = useState('');
  const [notiz, setNotiz] = useState('');
  const [stunden, setStunden] = useState('');
  const [busy, setBusy] = useState(false);
  const [konflikt, setKonflikt] = useState(null);

  const { data: kontext } = useProjektKontext(projekt?.id);

  const starten = async (force = false) => {
    setBusy(true);
    const res = await onStart(projekt, kuerzel, notiz, { force });
    setBusy(false);
    if (res?.conflict) setKonflikt(res.conflict);
  };

  const buchen = async () => {
    setBusy(true);
    await bucheZeit({
      projectId: projekt.id,
      email,
      durationMinutes: Math.round(Number(stunden) * 60),
      note: notiz,
      quelle: 'zeile',
    });
    setBusy(false);
    onBooked?.(Number(stunden), projekt.title);
  };

  if (konflikt) {
    const seit = zeitLabel(Math.max(0, Math.floor((Date.now() - new Date(konflikt.gestartet_am).getTime()) / 60000)));
    return (
      <div className="p-5">
        <p className="text-sm font-bold" style={{ color: RITTLER.black }}>
          Timer auf {konflikt.projekt_titel || 'ein anderes Projekt'} läuft seit {seit}. Stoppen und neu starten?
        </p>
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => { setKonflikt(null); starten(true); }}
            className="flex-1 h-10 rounded text-white text-sm font-bold uppercase disabled:opacity-60"
            style={{ backgroundColor: RITTLER.pink }}
          >
            Stoppen und neu starten
          </button>
          <button
            type="button"
            onClick={() => setKonflikt(null)}
            className="h-10 px-4 rounded border-[1.5px] text-sm font-bold uppercase"
            style={{ borderColor: RITTLER.black, color: RITTLER.black }}
          >
            Abbrechen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="flex gap-4 border-b mb-4" style={{ borderColor: RITTLER.line }}>
        {REITER.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setReiter(r.key)}
            className="pb-2 text-[11px] font-bold uppercase tracking-[2px] border-b-2"
            style={{
              color: reiter === r.key ? RITTLER.black : RITTLER.textSecondary,
              borderColor: reiter === r.key ? RITTLER.pink : 'transparent',
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      <ProjektWahl
        selected={projekt}
        onSelect={(p, k) => { setProjekt(p); setKuerzel(k); }}
      />

      {projekt && (
        <div className="mt-3 pt-3 border-t" style={{ borderColor: RITTLER.line }}>
          <p className="text-sm font-bold" style={{ color: RITTLER.black }}>{projekt.title}</p>
          <KategorieZeile kategorie={kontext?.kategorie} />
          <BudgetZeile budget={kontext?.budget} />

          {reiter === 'manuell' && (
            <Input
              type="number" step="0.25" min="0" placeholder="Stunden"
              className="mt-3" value={stunden} onChange={(e) => setStunden(e.target.value)}
            />
          )}
          <Input
            placeholder="Notiz (optional)"
            className="mt-2" value={notiz} onChange={(e) => setNotiz(e.target.value)}
          />

          {reiter === 'timer' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => starten(false)}
              className="mt-3 w-full h-11 rounded flex items-center justify-center gap-2 text-white text-sm font-bold uppercase tracking-wide disabled:opacity-60"
              style={{ backgroundColor: RITTLER.pink }}
            >
              <Play className="w-4 h-4" /> Starten
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !Number(stunden)}
              onClick={buchen}
              className="mt-3 w-full h-11 rounded text-white text-sm font-bold uppercase tracking-wide disabled:opacity-60"
              style={{ backgroundColor: RITTLER.pink }}
            >
              Buchen
            </button>
          )}
        </div>
      )}
    </div>
  );
}