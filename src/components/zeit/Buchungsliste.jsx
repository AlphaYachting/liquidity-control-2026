import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { minuteVonIso, uhr, dauerText, MODELL_TEXT, MODELL_FARBE } from '@/lib/zeit/tagesAuswertung';
import VerrechenbarSchalter from './VerrechenbarSchalter';

const Etikett = ({ children, farbe, flaeche }) => (
  <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-[2px]"
    style={{ color: farbe, backgroundColor: flaeche }}>
    {children}
  </span>
);

const zaehler = (e) => {
  if (e.kategorie === 'aufwand') {
    const betrag = e.stundensatz ? Math.round(((e.duration_minutes || 0) / 60) * e.stundensatz) : null;
    return betrag !== null ? `${betrag} EUR bei ${e.stundensatz} EUR/h` : 'Stundensatz fehlt';
  }
  if (e.kategorie === 'support') return e.ueber_kontingent ? 'Mehrleistung über Kontingent' : 'im Kontingent';
  if (e.kategorie === 'sprint') return 'im Sprintbudget';
  if (e.kategorie === 'paket') return 'im Pauschalpaket';
  return 'interne Zeit';
};

// Jede Buchung des Tages als Zeile.
export default function Buchungsliste({ auswertung, eintraege, projektLabel, gesperrt, onAendern, onLoeschen, onGeaendert }) {
  const ueberschneidend = new Set(auswertung.blocks.filter((b) => b.ueberschneidet).map((b) => b.entry.id));

  if (!eintraege.length) {
    return (
      <p className="p-8 text-center text-sm bg-white rounded border" style={{ borderColor: RITTLER.line, color: RITTLER.textSecondary }}>
        Für diesen Tag ist nichts erfasst.
      </p>
    );
  }

  return (
    <div className="bg-white rounded border divide-y" style={{ borderColor: RITTLER.line }}>
      {eintraege.map((e) => {
        const label = projektLabel(e);
        const fenster = e.started_at && e.ended_at
          ? `${uhr(minuteVonIso(e.started_at))}–${uhr(minuteVonIso(e.ended_at))}`
          : 'ohne Zeitfenster';
        return (
          <div key={e.id} className="px-3 py-2.5"
            style={e.ueber_kontingent ? { backgroundColor: STATUS_COLORS.attentionSurface } : undefined}>
          <div className="flex items-center gap-3">
            <span className="w-1 h-9 rounded-full shrink-0"
              style={{ backgroundColor: MODELL_FARBE[e.kategorie] || MODELL_FARBE.intern }} />
            <div className="w-[150px] shrink-0">
              <p className="text-sm font-semibold tabular-nums" style={{ color: RITTLER.black }}>{fenster}</p>
              <p className="text-xs" style={{ color: RITTLER.textSecondary }}>{dauerText(e.duration_minutes)}</p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: RITTLER.black }}>{label.voll}</p>
              <p className="text-xs truncate" style={{ color: RITTLER.textSecondary }}>
                {MODELL_TEXT[e.kategorie] || 'Zeitbuchung'} · {zaehler(e)}
                {e.taetigkeit ? ` · ${e.taetigkeit}` : ''}{e.note ? ` · ${e.note}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {ueberschneidend.has(e.id) && (
                <Etikett farbe={STATUS_COLORS.critical} flaeche={STATUS_COLORS.criticalSurface}>überschneidet sich</Etikett>
              )}
              {e.abrechnungsstatus === 'abgerechnet' && (
                <Etikett farbe={STATUS_COLORS.doneText} flaeche={STATUS_COLORS.doneSurface}>abgerechnet</Etikett>
              )}
              <button type="button" aria-label="Ändern" disabled={gesperrt} onClick={() => onAendern(e)}
                className="p-1.5 rounded hover:bg-muted disabled:opacity-40">
                <Pencil className="w-3.5 h-3.5" style={{ color: RITTLER.textSecondary }} />
              </button>
              <button type="button" aria-label="Löschen" disabled={gesperrt} onClick={() => onLoeschen(e)}
                className="p-1.5 rounded hover:bg-muted disabled:opacity-40">
                <Trash2 className="w-3.5 h-3.5" style={{ color: RITTLER.textSecondary }} />
              </button>
            </div>
          </div>
          <div className="pl-4 mt-1.5">
            <VerrechenbarSchalter eintrag={e} gesperrt={gesperrt} onSaved={onGeaendert} />
          </div>
          </div>
        );
      })}
    </div>
  );
}