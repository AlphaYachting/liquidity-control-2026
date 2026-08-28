import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { RITTLER, STATUS_COLORS, fmtEUR, fmtDate } from '@/components/sprint/sprintConfig';
import { useProjektKontext } from '@/lib/sprint/useProjektKontext';
import { loescheZeit } from '@/lib/sprint/useTimer';
import { dauerText } from '@/lib/zeit/tagesAuswertung';
import HauptKnopf from './HauptKnopf';
import FussVerweise from './FussVerweise';

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
    <div className="px-4 pt-[14px] pb-4">
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

      {!weg && info.offenerTag && (
        <p
          className="text-[13px] mt-3 p-2 rounded"
          style={{ backgroundColor: STATUS_COLORS.attentionSurface, color: STATUS_COLORS.attention }}
        >
          {info.offenerTag.slice(8, 10)}.{info.offenerTag.slice(5, 7)}. ist weiterhin offen.
        </p>
      )}

      <HauptKnopf onClick={onFertig}>
        {info.offenerTag ? 'Zum offenen Tag' : 'Fertig'}
      </HauptKnopf>

      <FussVerweise
        rechts={!weg && info.eintragId && !busy ? { text: 'Rückgängig', onClick: rueckgaengig } : null}
      />
    </div>
  );
}