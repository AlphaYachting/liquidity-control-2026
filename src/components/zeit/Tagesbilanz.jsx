import React from 'react';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { dauerText } from '@/lib/zeit/tagesAuswertung';

const Kachel = ({ titel, wert, zusatz, warnung }) => (
  <div
    className="p-3 rounded bg-white"
    style={{
      border: `1px solid ${warnung ? STATUS_COLORS.attention : RITTLER.line}`,
      backgroundColor: warnung ? STATUS_COLORS.attentionSurface : undefined,
    }}
  >
    <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: RITTLER.textSecondary }}>{titel}</p>
    <p className="text-[19px] font-bold tabular-nums mt-1" style={{ color: warnung ? STATUS_COLORS.attention : RITTLER.black }}>
      {wert}
    </p>
    <p className="text-xs mt-0.5" style={{ color: RITTLER.textSecondary }}>{zusatz}</p>
  </div>
);

// Vier Kacheln: Gebucht, Verrechenbar, Nicht verrechenbar, Offene Lücke.
// Mit Anwesenheitserfassung kommt vorne die Arbeitszeit dazu (Kommen bis Gehen ohne Pausen).
// anwesenheit: { arbeitszeitMin, pauseMin, kommen, gehen, zustand } oder null
export default function Tagesbilanz({ auswertung, anwesenheit = null, mitArbeitszeit = false }) {
  const a = auswertung;
  const uhrVon = (iso) => (iso ? new Date(iso).toTimeString().slice(0, 5) : '');
  return (
    <div className={`grid grid-cols-2 gap-2 ${mitArbeitszeit ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
      {mitArbeitszeit && (
        <Kachel titel="Arbeitszeit" wert={dauerText(anwesenheit?.arbeitszeitMin || 0)}
          zusatz={anwesenheit?.kommen
            ? `${uhrVon(anwesenheit.kommen)}–${anwesenheit.zustand !== 'weg' ? 'jetzt' : uhrVon(anwesenheit.gehen)}${anwesenheit.pauseMin ? `, Pause ${dauerText(anwesenheit.pauseMin)}` : ''}`
            : 'nicht gestempelt'} />
      )}
      <Kachel titel="Gebucht" wert={dauerText(a.gebuchtMinuten)}
        zusatz={`${a.anzahl} ${a.anzahl === 1 ? 'Buchung' : 'Buchungen'}`} />
      <Kachel titel="Verrechenbar" wert={dauerText(a.verrechenbarMinuten)}
        zusatz={a.betrag > 0 ? `${a.betrag} EUR nach Aufwand` : 'kein Aufwandsprojekt'} />
      <Kachel titel="Nicht verrechenbar" wert={dauerText(a.nichtVerrechenbarMinuten)}
        zusatz={`${a.nichtVerrechenbarAnteil} % der Tageszeit`} warnung={a.nichtVerrechenbarAnteil >= 25} />
      <Kachel titel="Offene Lücke" wert={dauerText(a.offenMinuten)}
        zusatz={a.offenMinuten > 0 ? 'nicht erfasste Zeit' : 'alles erfasst'} warnung={a.offenMinuten >= 45} />
    </div>
  );
}