import React from 'react';
import { Coffee } from 'lucide-react';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { STRIP_VON, STRIP_BIS, uhr, dauerText, MODELL_FARBE } from '@/lib/zeit/tagesAuswertung';

const SPANNE = STRIP_BIS - STRIP_VON;
const pos = (minute) => `${((Math.min(Math.max(minute, STRIP_VON), STRIP_BIS) - STRIP_VON) / SPANNE) * 100}%`;
const breite = (von, bis) => `${((Math.min(bis, STRIP_BIS) - Math.max(von, STRIP_VON)) / SPANNE) * 100}%`;
const SCHRAFFUR = 'repeating-linear-gradient(45deg, rgba(255,255,255,.45) 0 4px, transparent 4px 8px)';

// Der Tag als waagrechter Streifen von 07:00 bis 20:00.
export default function Tagesstreifen({ auswertung, kuerzelVon, istHeute, jetztMinute, onLoch, onPause }) {
  const stunden = Array.from({ length: (STRIP_BIS - STRIP_VON) / 60 + 1 }, (_, i) => STRIP_VON + i * 60);
  const hoehe = auswertung.spuren * 34;

  return (
    <div className="bg-white rounded border p-3" style={{ borderColor: RITTLER.line }}>
      <div className="relative h-4">
        {stunden.map((m) => (
          <span key={m} className="absolute -translate-x-1/2 text-[10px] tabular-nums"
            style={{ left: pos(m), color: RITTLER.textSecondary }}>
            {uhr(m)}
          </span>
        ))}
      </div>

      <div className="relative mt-1" style={{ height: hoehe }}>
        {stunden.map((m) => (
          <span key={m} className="absolute top-0 bottom-0 w-px" style={{ left: pos(m), backgroundColor: RITTLER.line }} />
        ))}

        {auswertung.pausen.map((p, i) => (
          <div key={`p${i}`} className="absolute top-0 bottom-0 flex items-center justify-center"
            style={{ left: pos(p.von), width: breite(p.von, p.bis), backgroundColor: RITTLER.surface }}>
            <Coffee className="w-3.5 h-3.5" style={{ color: RITTLER.textSecondary }} />
          </div>
        ))}

        {auswertung.loecher.map((l, i) => (
          <div
            key={`l${i}`}
            className="absolute top-0 bottom-0 rounded-[2px] flex items-center justify-center gap-1 cursor-pointer"
            style={{ left: pos(l.von), width: breite(l.von, l.bis), border: `1px dashed ${RITTLER.decorGray}` }}
            title={`${uhr(l.von)}–${uhr(l.bis)} nicht erfasst — klicken zum Übernehmen`}
            onClick={() => onLoch(l)}
            onContextMenu={(e) => { e.preventDefault(); onPause(l); }}
          >
            <span className="text-[10px] whitespace-nowrap" style={{ color: RITTLER.textSecondary }}>
              {dauerText(l.minuten)}
            </span>
            <button
              type="button"
              aria-label="Als Pause vermerken"
              onClick={(e) => { e.stopPropagation(); onPause(l); }}
              className="p-0.5 rounded hover:bg-muted"
            >
              <Coffee className="w-3 h-3" style={{ color: RITTLER.textSecondary }} />
            </button>
          </div>
        ))}

        {auswertung.blocks.map((b) => {
          const farbe = MODELL_FARBE[b.entry.kategorie] || MODELL_FARBE.intern;
          return (
            <div
              key={b.entry.id}
              className="absolute rounded-[2px] px-1.5 overflow-hidden flex items-center"
              title={`${uhr(b.von)}–${uhr(b.bis)} · ${b.entry.note || ''}`}
              style={{
                left: pos(b.von),
                width: breite(b.von, b.bis),
                top: b.spur * 34,
                height: 30,
                backgroundColor: farbe,
                backgroundImage: b.entry.verrechenbar === false ? SCHRAFFUR : undefined,
              }}
            >
              <span className="text-[11px] font-bold text-white truncate">
                {kuerzelVon(b.entry)} {uhr(b.von)}–{uhr(b.bis)}
              </span>
            </div>
          );
        })}

        {istHeute && jetztMinute >= STRIP_VON && jetztMinute <= STRIP_BIS && (
          <span className="absolute top-0 bottom-0 w-[1.5px]" style={{ left: pos(jetztMinute), backgroundColor: RITTLER.pink }} />
        )}
      </div>
    </div>
  );
}