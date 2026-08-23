import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { aendereZeit } from '@/lib/sprint/useTimer';

export const GRUENDE = [
  { wert: 'kulanz', label: 'Kulanz' },
  { wert: 'interne_nacharbeit', label: 'Interne Nacharbeit' },
  { wert: 'fehler', label: 'Fehler von uns' },
  { wert: 'einarbeitung', label: 'Einarbeitung' },
  { wert: 'akquise', label: 'Akquise' },
  { wert: 'intern', label: 'Intern' },
];
export const GRUND_LABEL = Object.fromEntries(GRUENDE.map((g) => [g.wert, g.label]));

const betragVon = (e) => (e.stundensatz ? Math.round(((e.duration_minutes || 0) / 60) * e.stundensatz) : null);

// Ein Schalter je Buchung. Nicht verrechenbar geht nur mit einem der sechs Gründe.
export default function VerrechenbarSchalter({ eintrag, gesperrt, onSaved }) {
  const intern = eintrag.kategorie === 'intern';
  const verrechenbar = !intern && eintrag.verrechenbar !== false;
  const [grundOffen, setGrundOffen] = useState(false);
  const [busy, setBusy] = useState(false);

  const speichern = async (patch) => {
    setBusy(true);
    await aendereZeit(eintrag.id, patch);
    setBusy(false);
    setGrundOffen(false);
    onSaved?.();
  };

  const umschalten = (an) => {
    if (an) speichern({ verrechenbar: true, nicht_verrechenbar_grund: '' });
    else setGrundOffen(true);
  };

  const entgangen = eintrag.kategorie === 'aufwand' ? betragVon(eintrag) : null;

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 flex-wrap">
        <Switch
          checked={verrechenbar}
          disabled={intern || gesperrt || busy}
          onCheckedChange={umschalten}
          aria-label="Verrechenbar"
        />
        <span className="text-xs font-semibold" style={{ color: verrechenbar ? STATUS_COLORS.doneText : STATUS_COLORS.attention }}>
          {verrechenbar ? 'verrechenbar' : 'nicht verrechenbar'}
        </span>
        {!verrechenbar && eintrag.nicht_verrechenbar_grund && (
          <button
            type="button"
            disabled={intern || gesperrt}
            onClick={() => setGrundOffen((o) => !o)}
            className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-[2px] disabled:cursor-default"
            style={{ color: STATUS_COLORS.attention, backgroundColor: STATUS_COLORS.attentionSurface }}
          >
            {GRUND_LABEL[eintrag.nicht_verrechenbar_grund] || eintrag.nicht_verrechenbar_grund}
          </button>
        )}
        {!verrechenbar && entgangen !== null && (
          <span className="text-xs" style={{ color: STATUS_COLORS.attention }}>entgangen {entgangen} EUR</span>
        )}
        {!verrechenbar && !eintrag.nicht_verrechenbar_grund && !grundOffen && (
          <button type="button" onClick={() => setGrundOffen(true)} className="text-xs underline" style={{ color: STATUS_COLORS.attention }}>
            Grund fehlt
          </button>
        )}
      </div>

      {grundOffen && !intern && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: RITTLER.textSecondary }}>Grund</span>
          {GRUENDE.map((g) => (
            <button
              key={g.wert}
              type="button"
              disabled={busy}
              onClick={() => speichern({ verrechenbar: false, nicht_verrechenbar_grund: g.wert })}
              className="h-7 px-2.5 rounded text-xs font-semibold border disabled:opacity-50"
              style={{
                borderColor: eintrag.nicht_verrechenbar_grund === g.wert ? RITTLER.black : RITTLER.line,
                color: RITTLER.black,
              }}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}