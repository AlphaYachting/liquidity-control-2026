import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { minuteVonIso, uhr, dauerText, MODELL_TEXT, MODELL_FARBE } from '@/lib/zeit/tagesAuswertung';
import VerrechenbarSchalter from './VerrechenbarSchalter';
import TaetigkeitEtikett from './TaetigkeitEtikett';

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

// Eine Buchung als Zeile. Korrekturen stehen eingerückt unter dem Original.
export default function BuchungZeile({
  eintrag: e, label, ueberschneidet, gesperrt, korrigiert, istKorrektur, onAendern, onLoeschen, onGeaendert,
}) {
  const fenster = e.started_at && e.ended_at
    ? `${uhr(minuteVonIso(e.started_at))}–${uhr(minuteVonIso(e.ended_at))}`
    : 'ohne Zeitfenster';

  return (
    <div className={`px-3 py-2.5 ${istKorrektur ? 'pl-10 bg-muted/40' : ''}`}
      style={!istKorrektur && e.ueber_kontingent ? { backgroundColor: STATUS_COLORS.attentionSurface } : undefined}>
      <div className="flex items-center gap-3">
        <span className="w-1 h-9 rounded-full shrink-0"
          style={{ backgroundColor: MODELL_FARBE[e.kategorie] || MODELL_FARBE.intern }} />
        <div className="w-[150px] shrink-0">
          <p className={`text-sm font-semibold tabular-nums ${korrigiert ? 'line-through' : ''}`} style={{ color: RITTLER.black }}>
            {fenster}
          </p>
          <p className={`text-xs ${korrigiert ? 'line-through' : ''}`} style={{ color: RITTLER.textSecondary }}>
            {dauerText(e.duration_minutes)}
          </p>
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${korrigiert ? 'line-through' : ''}`} style={{ color: RITTLER.black }}>
            {label.voll}
          </p>
          <p className="text-xs truncate" style={{ color: RITTLER.textSecondary }}>
            {MODELL_TEXT[e.kategorie] || 'Zeitbuchung'} · {zaehler(e)}{e.note ? ` · ${e.note}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <TaetigkeitEtikett eintrag={e} onGeaendert={onGeaendert} />
          {istKorrektur && (
            <Etikett farbe={STATUS_COLORS.attention} flaeche={STATUS_COLORS.attentionSurface}>Korrektur</Etikett>
          )}
          {ueberschneidet && (
            <Etikett farbe={STATUS_COLORS.critical} flaeche={STATUS_COLORS.criticalSurface}>überschneidet sich</Etikett>
          )}
          {e.abrechnungsstatus === 'abgerechnet' && (
            <Etikett farbe={STATUS_COLORS.doneText} flaeche={STATUS_COLORS.doneSurface}>abgerechnet</Etikett>
          )}
          {!istKorrektur && (
            <>
              <button type="button" aria-label={gesperrt ? 'Korrigieren' : 'Ändern'} onClick={() => onAendern(e)}
                className="p-1.5 rounded hover:bg-muted">
                <Pencil className="w-3.5 h-3.5" style={{ color: RITTLER.textSecondary }} />
              </button>
              <button type="button" aria-label={gesperrt ? 'Stornieren' : 'Löschen'} onClick={() => onLoeschen(e)}
                className="p-1.5 rounded hover:bg-muted">
                <Trash2 className="w-3.5 h-3.5" style={{ color: RITTLER.textSecondary }} />
              </button>
            </>
          )}
        </div>
      </div>
      {!istKorrektur && (
        <div className="pl-4 mt-1.5">
          <VerrechenbarSchalter eintrag={e} gesperrt={gesperrt} onSaved={onGeaendert} />
        </div>
      )}
    </div>
  );
}