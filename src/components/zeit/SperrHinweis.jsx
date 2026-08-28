import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { dauerText } from '@/lib/zeit/tagesAuswertung';

const fmt = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

// Eine Sperrmeldung, die nur sagt was nicht geht, ist unbrauchbar — hier steht
// immer der Weg hinaus.
export default function SperrHinweis({ aeltester, onAbschluss, onZurueck }) {
  if (!aeltester) return null;

  return (
    <div className="p-5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5" style={{ color: STATUS_COLORS.attention }} />
        <p className="text-[17px] font-bold" style={{ color: RITTLER.black }}>
          {fmt(aeltester.tag)} ist noch offen
        </p>
      </div>

      <p className="text-[13px] mt-2" style={{ color: RITTLER.textSecondary }}>
        {aeltester.offenMinuten > 0
          ? `Dort fehlen noch ${dauerText(aeltester.offenMinuten)}.`
          : 'Dort ist noch nichts erfasst.'}
        {' '}Ein NEUER Timer lässt sich erst starten, wenn dieser Tag abgeschlossen ist.
        Ein laufender Timer kann immer gestoppt und gebucht werden.
      </p>

      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={() => onAbschluss(aeltester.tag)}
          className="flex-1 h-11 rounded text-white text-sm font-bold uppercase tracking-wide"
          style={{ backgroundColor: RITTLER.pink }}
        >
          {fmt(aeltester.tag)} jetzt abschließen
        </button>
        <button
          type="button"
          onClick={onZurueck}
          className="h-11 px-4 rounded border-[1.5px] text-sm font-bold uppercase"
          style={{ borderColor: RITTLER.black, color: RITTLER.black }}
        >
          Zurück
        </button>
      </div>
    </div>
  );
}