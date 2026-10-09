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
export default function Tagesbilanz({ auswertung }) {
  const a = auswertung;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
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