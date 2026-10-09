import React from 'react';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { STRIP_VON, STRIP_BIS, uhr, dauerText, MODELL_FARBE, minuteVonIso } from '@/lib/zeit/tagesAuswertung';
import { STATUS_COLORS } from '@/components/sprint/sprintConfig';

const SPANNE = STRIP_BIS - STRIP_VON;
const pos = (minute) => `${((Math.min(Math.max(minute, STRIP_VON), STRIP_BIS) - STRIP_VON) / SPANNE) * 100}%`;
const breite = (von, bis) => `${((Math.min(bis, STRIP_BIS) - Math.max(von, STRIP_VON)) / SPANNE) * 100}%`;
const SCHRAFFUR = 'repeating-linear-gradient(45deg, rgba(255,255,255,.45) 0 4px, transparent 4px 8px)';

// Der Tag als waagrechter Streifen von 07:00 bis 20:00. Nicht gebuchte Zeit bleibt eine Lücke —
// es gibt keine Pausen mehr. Ein Klick auf eine Lücke übernimmt ihr Zeitfenster in die Erfassung.
// nurLesen: Lücken sind nicht anklickbar (Arbeitszeitauswertung).
// anwesenheit (Anwesenheitserfassung): { bloecke, pausen, kommen, gehen } als ISO-Zeiten — dann liegt hinter
// den Buchungen ein grünes Band von Kommen bis Gehen, Pausen gelb gestrichelt, Striche bei Kommen und Gehen;
// der Strich „Tool geöffnet“ entfällt.
export default function Tagesstreifen({ auswertung, kuerzelVon, istHeute, jetztMinute, onLoch, nurLesen = false, anwesenheit = null }) {
  const stunden = Array.from({ length: (STRIP_BIS - STRIP_VON) / 60 + 1 }, (_, i) => STRIP_VON + i * 60);
  const hoehe = auswertung.spuren * 34;
  const bis = (iso) => (iso ? minuteVonIso(iso) : (istHeute ? jetztMinute : null));
  const baender = anwesenheit ? (anwesenheit.bloecke || []).map((b) => ({ von: minuteVonIso(b.von), bis: bis(b.bis) })).filter((b) => b.bis !== null && b.bis > b.von) : [];
  const pausenAnw = anwesenheit ? (anwesenheit.pausen || []).map((p) => ({ von: minuteVonIso(p.von), bis: bis(p.bis) })).filter((p) => p.bis !== null && p.bis > p.von) : [];

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

        {baender.map((b, i) => (
          <div key={`a${i}`} className="absolute -top-0.5 -bottom-0.5 rounded-[2px]" title={`anwesend ${uhr(b.von)}–${uhr(b.bis)}`}
            style={{ left: pos(b.von), width: breite(b.von, b.bis), backgroundColor: STATUS_COLORS.doneSurface }} />
        ))}
        {pausenAnw.map((p, i) => (
          <div key={`p${i}`} className="absolute top-0 bottom-0 rounded-[2px]" title={`Pause ${uhr(p.von)}–${uhr(p.bis)}`}
            style={{ left: pos(p.von), width: breite(p.von, p.bis), backgroundColor: STATUS_COLORS.attentionSurface, border: `1px dashed ${STATUS_COLORS.attention}` }} />
        ))}

        {auswertung.loecher.map((l, i) => (
          <div
            key={`l${i}`}
            className={`absolute top-0 bottom-0 rounded-[2px] flex items-center justify-center gap-1 ${nurLesen ? '' : 'cursor-pointer'}`}
            style={{ left: pos(l.von), width: breite(l.von, l.bis), border: `1px dashed ${RITTLER.decorGray}` }}
            title={nurLesen ? `${uhr(l.von)}–${uhr(l.bis)} nicht gebucht` : `${uhr(l.von)}–${uhr(l.bis)} nicht gebucht — klicken zum Übernehmen`}
            onClick={nurLesen ? undefined : () => onLoch?.(l)}
          >
            <span className="text-[10px] whitespace-nowrap" style={{ color: RITTLER.textSecondary }}>
              {dauerText(l.minuten)}
            </span>
          </div>
        ))}

        {anwesenheit?.kommen && (
          <span className="absolute -top-1 -bottom-1 w-[2px] rounded" style={{ left: pos(minuteVonIso(anwesenheit.kommen)), backgroundColor: STATUS_COLORS.done }}
            title={`Gekommen um ${uhr(minuteVonIso(anwesenheit.kommen))}`} aria-label={`Gekommen um ${uhr(minuteVonIso(anwesenheit.kommen))}`} />
        )}
        {anwesenheit?.gehen && (
          <span className="absolute -top-1 -bottom-1 w-[2px] rounded" style={{ left: pos(minuteVonIso(anwesenheit.gehen)), backgroundColor: RITTLER.black }}
            title={`Gegangen um ${uhr(minuteVonIso(anwesenheit.gehen))}`} aria-label={`Gegangen um ${uhr(minuteVonIso(anwesenheit.gehen))}`} />
        )}

        {!anwesenheit && auswertung.tagesbeginn !== null && auswertung.tagesbeginn !== undefined
          && auswertung.tagesbeginn >= STRIP_VON && auswertung.tagesbeginn <= STRIP_BIS && (
          <span className="absolute -top-1 -bottom-1 w-[2px] rounded"
            style={{ left: pos(auswertung.tagesbeginn), backgroundColor: RITTLER.black }}
            title={`Tool geöffnet um ${uhr(auswertung.tagesbeginn)}`} aria-label={`Tool geöffnet um ${uhr(auswertung.tagesbeginn)}`} />
        )}

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