import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { dauerText } from '@/lib/zeit/tagesAuswertung';

const WOCHENTAG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];

const zustand = (tag) => {
  if (tag.abgeschlossen) {
    const text = tag.grund === 'frei' ? 'frei' : tag.grund === 'abwesend' ? 'abwesend' : 'abgeschlossen';
    return { farbe: STATUS_COLORS.done, text };
  }
  if (tag.istZukunft) return { farbe: STATUS_COLORS.neutral, text: 'noch nicht dran' };
  if (!tag.anzahl) return { farbe: STATUS_COLORS.neutral, text: 'nichts erfasst', offen: !tag.istHeute };
  if (tag.offenMinuten > 0) {
    return { farbe: STATUS_COLORS.attention, text: `${dauerText(tag.offenMinuten)} offen`, offen: !tag.istHeute };
  }
  return { farbe: STATUS_COLORS.done, text: 'vollständig', offen: !tag.istHeute };
};

// Montag bis Freitag auf einen Blick — offene vergangene Tage tragen einen orangen Rahmen.
export default function Wochenstreifen({ tage, gewaehlt, onWaehlen, onZurueck, onVor }) {
  return (
    <div className="flex items-stretch gap-2">
      <button type="button" onClick={onZurueck} aria-label="Woche zurück"
        className="px-2 rounded border" style={{ borderColor: RITTLER.line, color: RITTLER.textSecondary }}>
        <ChevronLeft className="w-4 h-4" />
      </button>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 flex-1">
        {tage.map((tag, i) => {
          const z = zustand(tag);
          const aktiv = tag.tag === gewaehlt;
          const rahmen = aktiv
            ? `1.5px solid ${RITTLER.black}`
            : z.offen
              ? `1.5px solid ${STATUS_COLORS.attention}`
              : `1px solid ${RITTLER.line}`;
          return (
            <button
              key={tag.tag}
              type="button"
              onClick={() => onWaehlen(tag.tag)}
              className="text-left p-3 rounded bg-white"
              style={{ border: rahmen }}
            >
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: RITTLER.textSecondary }}>
                {WOCHENTAG[i]} · {tag.tag.slice(8, 10)}.{tag.tag.slice(5, 7)}.
              </p>
              <p className="text-[19px] font-bold tabular-nums mt-1" style={{ color: RITTLER.black }}>
                {dauerText(tag.gebuchtMinuten)}
              </p>
              <p className="flex items-center gap-1.5 mt-1 text-xs" style={{ color: RITTLER.textSecondary }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: z.farbe }} />
                {z.text}
              </p>
            </button>
          );
        })}
      </div>

      <button type="button" onClick={onVor} aria-label="Woche vor"
        className="px-2 rounded border" style={{ borderColor: RITTLER.line, color: RITTLER.textSecondary }}>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}