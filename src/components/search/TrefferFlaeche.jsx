import React from 'react';
import { RITTLER } from '@/components/sprint/sprintConfig';
import TrefferZeile from './TrefferZeile';

const GruppenTitel = ({ titel, anzahl }) => (
  <div className="flex items-center justify-between px-3.5 pt-2.5 pb-1">
    <span className="text-[9.5px] font-bold uppercase text-primary" style={{ letterSpacing: '1.8px' }}>{titel}</span>
    <span className="text-[10.5px]" style={{ color: RITTLER.textSecondary }}>{anzahl}</span>
  </div>
);

// Die Fläche zeigt Gruppen, Deckelung, Aufklapper, Fußzeile.
export default function TrefferFlaeche({
  eingabe, gruppen, flach, markiert, setMarkiert, aufklappen, offen,
  tiefLaeuft, anzahlImSpeicher, zuletzt, onOeffnen,
}) {
  return (
    <div
      className="absolute left-0 right-0 z-50 bg-white overflow-hidden"
      style={{ top: 'calc(100% + 6px)', border: '1px solid #2d2d2d', borderRadius: 3 }}
    >
      <div className="overflow-y-auto" style={{ maxHeight: 'min(62vh, 470px)' }}>
        {!eingabe && zuletzt.length > 0 && (
          <>
            <GruppenTitel titel="Zuletzt geöffnet" anzahl={zuletzt.length} />
            {zuletzt.map((z, i) => (
              <TrefferZeile
                key={z.route}
                zeile={z}
                eingabe=""
                markiert={markiert === i}
                onZeigen={() => setMarkiert(i)}
                onWaehlen={() => onOeffnen(z)}
              />
            ))}
          </>
        )}

        {!!eingabe && gruppen.length === 0 && !tiefLaeuft && (
          <div className="px-3.5 py-4">
            <p className="text-[13.5px] font-semibold" style={{ color: RITTLER.black }}>
              Nichts zu „{eingabe}" gefunden.
            </p>
            <p className="text-[11.5px] mt-0.5" style={{ color: RITTLER.textSecondary }}>
              Andere Schreibweise, Kürzel oder Belegnummer versuchen.
            </p>
          </div>
        )}

        {!!eingabe && gruppen.map((g) => {
          const sichtbar = offen[g.key] ? g.alle : g.alle.slice(0, g.max);
          const rest = g.alle.length - sichtbar.length;
          return (
            <React.Fragment key={g.key}>
              <GruppenTitel titel={g.titel} anzahl={g.alle.length} />
              {sichtbar.map((z) => {
                const i = flach.findIndex((f) => f.__key === `${g.key}:${z.id || z.route}`);
                return (
                  <TrefferZeile
                    key={`${g.key}:${z.id || z.route}`}
                    zeile={z}
                    eingabe={eingabe}
                    markiert={markiert === i}
                    onZeigen={() => setMarkiert(i)}
                    onWaehlen={() => onOeffnen(z)}
                  />
                );
              })}
              {rest > 0 && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => aufklappen(g.key)}
                  className="w-full text-left px-3.5 py-1.5 text-[11.5px]"
                  style={{ color: RITTLER.textSecondary }}
                >
                  … {rest} weitere in {g.titel}
                </button>
              )}
            </React.Fragment>
          );
        })}

        {tiefLaeuft && (
          <p className="px-3.5 py-2 text-[11.5px]" style={{ color: RITTLER.textSecondary }}>
            ● Postfach und Kundenakt werden durchsucht …
          </p>
        )}
      </div>

      <div
        className="flex items-center justify-between px-3.5 py-1.5 text-[10.5px] border-t"
        style={{ borderColor: RITTLER.line, color: RITTLER.textSecondary }}
      >
        <span>↑↓ wählen · ↵ öffnen · esc schließen</span>
        <span>{anzahlImSpeicher} Einträge im Speicher</span>
      </div>
    </div>
  );
}