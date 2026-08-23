import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { dauerText } from '@/lib/zeit/tagesAuswertung';

const WOCHENTAG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];

const punkt = (tag) => {
  if (!tag.anzahl) return { farbe: STATUS_COLORS.neutral, text: 'nichts erfasst' };
  if (tag.offenMinuten <= 0) return { farbe: STATUS_COLORS.done, text: 'vollständig' };
  return { farbe: STATUS_COLORS.attention, text: `${dauerText(tag.offenMinuten)} offen` };
};

// Montag bis Freitag auf einen Blick — ein Klick wechselt den Tag.
export default function Wochenstreifen({ tage, gewaehlt, onWaehlen, onZurueck, onVor }) {
  return (
    <div className="flex items-stretch gap-2">
      <button type="button" onClick={onZurueck} aria-label="Woche zurück"
        className="px-2 rounded border" style={{ borderColor: RITTLER.line, color: RITTLER.textSecondary }}>
        <ChevronLeft className="w-4 h-4" />
      </button>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 flex-1">
        {tage.map((tag, i) => {
          const p = punkt(tag);
          const aktiv = tag.tag === gewaehlt;
          return (
            <button
              key={tag.tag}
              type="button"
              onClick={() => onWaehlen(tag.tag)}
              className="text-left p-3 rounded bg-white"
              style={{ border: aktiv ? `1.5px solid ${RITTLER.black}` : `1px solid ${RITTLER.line}` }}
            >
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: RITTLER.textSecondary }}>
                {WOCHENTAG[i]} · {tag.tag.slice(8, 10)}.{tag.tag.slice(5, 7)}.
              </p>
              <p className="text-[19px] font-bold tabular-nums mt-1" style={{ color: RITTLER.black }}>
                {dauerText(tag.gebuchtMinuten)}
              </p>
              <p className="flex items-center gap-1.5 mt-1 text-xs" style={{ color: RITTLER.textSecondary }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.farbe }} />
                {p.text}
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