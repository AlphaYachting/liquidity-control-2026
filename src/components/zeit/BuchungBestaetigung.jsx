import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { RITTLER, STATUS_COLORS, fmtEUR, fmtDate } from '@/components/sprint/sprintConfig';
import { useProjektKontext } from '@/lib/sprint/useProjektKontext';
import { loescheZeit } from '@/lib/sprint/useTimer';
import { dauerText } from '@/lib/zeit/tagesAuswertung';

// Bestätigung im Fenster statt Toast — mit der Möglichkeit, die Buchung zurückzunehmen.
export default function BuchungBestaetigung({ info, onFertig, onRueckgaengig }) {
  const [busy, setBusy] = useState(false);
  const [weg, setWeg] = useState(false);
  const { data: pk } = useProjektKontext(info.projectId);

  const satz = pk?.kategorie === 'aufwand' ? Number(pk?.project?.stundensatz) || 0 : 0;
  const betrag = satz > 0 ? (info.minuten / 60) * satz : 0;

  const rueckgaengig = async () => {
    setBusy(true);
    await loescheZeit(info.eintragId);
    setWeg(true);
    setBusy(false);
    onRueckgaengig?.();
  };

  return (
    <div className="p-5">
      <div className="flex items-center gap-2">
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center"
          style={{ backgroundColor: weg ? '#eeeeee' : STATUS_COLORS.doneSurface }}
        >
          <Check className="w-4 h-4" style={{ color: weg ? RITTLER.textSecondary : STATUS_COLORS.doneText }} />
        </span>
        <p className="text-[17px] font-bold" style={{ color: RITTLER.black }}>
          {weg ? 'Buchung zurückgenommen' : `${dauerText(info.minuten)} gebucht`}
        </p>
      </div>

      {!weg && (
        <div className="mt-2 space-y-0.5">
          <p className="text-sm font-semibold" style={{ color: RITTLER.black }}>{info.projekt || 'Projekt'}</p>
          {info.aufgabe && (
            <p className="text-[13px]" style={{ color: RITTLER.textSecondary }}>Aufgabe „{info.aufgabe}"</p>
          )}
          {info.datum && (
            <p className="text-[13px]" style={{ color: RITTLER.textSecondary }}>{fmtDate(info.datum)}</p>
          )}
          {betrag > 0 && (
            <p className="text-[13px]" style={{ color: RITTLER.textSecondary }}>
              nach Aufwand: {fmtEUR(betrag)}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-4">
        {!weg && info.eintragId && (
          <button
            type="button"
            disabled={busy}
            onClick={rueckgaengig}
            className="h-11 px-4 rounded border-[1.5px] text-sm font-bold uppercase disabled:opacity-60"
            style={{ borderColor: RITTLER.black, color: RITTLER.black }}
          >
            Rückgängig
          </button>
        )}
        <button
          type="button"
          onClick={onFertig}
          className="flex-1 h-11 rounded text-white text-sm font-bold uppercase tracking-wide"
          style={{ backgroundColor: RITTLER.pink }}
        >
          Fertig
        </button>
      </div>
    </div>
  );
}