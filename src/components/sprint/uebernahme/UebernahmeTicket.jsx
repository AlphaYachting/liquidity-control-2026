import React from 'react';
import { ANTWORTEN, WARTET_AUF, istBestaetigt } from '@/lib/sprint/uebernahme';

const feld = 'h-11 rounded border border-[#d4d4d4] bg-white px-3 text-sm text-foreground';
const beschriftung = 'flex flex-col gap-1 text-xs font-semibold text-muted-foreground';

// Ein Ticket der Übernahme: sechs Antworten, ein Klick speichert sofort.
// Je nach Antwort klappen freiwillige Zusatzangaben auf.
export default function UebernahmeTicket({ ticket, laeuft, fehler, darfArchivieren, onAntwort, onDetail }) {
  const antwort = istBestaetigt(ticket) ? ticket.uebernahme_antwort : null;
  const meins = antwort === 'offen' || antwort === 'in_arbeit';

  return (
    <div className="rounded border border-border bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-semibold text-foreground">{ticket.title}</p>
        {ticket.planned_for && (
          <span className="text-xs text-muted-foreground">fällig {new Date(`${ticket.planned_for}T00:00:00`).toLocaleDateString('de-AT')}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {ANTWORTEN.map((a) => {
          const an = antwort === a.wert;
          return (
            <button
              key={a.wert}
              type="button"
              aria-pressed={an}
              disabled={laeuft}
              onClick={() => onAntwort(ticket, a.wert)}
              className={`min-h-[44px] px-3.5 rounded border text-[13px] disabled:opacity-60 ${an
                ? 'bg-foreground text-background border-foreground font-semibold'
                : 'bg-white text-foreground border-[#d4d4d4] font-medium hover:bg-muted'}`}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      {fehler && <p className="text-xs text-status-critical">{fehler}</p>}

      {meins && (
        <div className="flex flex-wrap items-end gap-4 rounded bg-muted p-3">
          <label className={beschriftung}>Noch nötig (Stunden)
            <input
              type="number" min="0" step="0.5" placeholder="z. B. 4"
              defaultValue={ticket.rest_stunden ?? ''}
              onBlur={(e) => {
                const v = e.target.value === '' ? null : Number(e.target.value);
                if (v !== (ticket.rest_stunden ?? null)) onDetail(ticket, { rest_stunden: v });
              }}
              className={`${feld} w-36`}
            />
          </label>
          <label className={beschriftung}>Fällig am
            <input
              type="date"
              defaultValue={ticket.planned_for || ''}
              onChange={(e) => onDetail(ticket, { planned_for: e.target.value || null })}
              className={`${feld} w-44`}
            />
          </label>
          <span className="pb-3 text-xs text-muted-foreground">Beides freiwillig, hilft aber bei der Planung.</span>
        </div>
      )}

      {antwort === 'wartet' && (
        <div className="flex flex-wrap items-end gap-4 rounded bg-muted p-3">
          <label className={beschriftung}>Auf wen?
            <select
              value={ticket.wartet_auf || 'kunde'}
              onChange={(e) => onDetail(ticket, { wartet_auf: e.target.value })}
              className={`${feld} w-44`}
            >
              {WARTET_AUF.map((w) => <option key={w.wert} value={w.wert}>{w.label}</option>)}
            </select>
          </label>
          <label className={beschriftung}>Seit wann?
            <input
              type="date"
              defaultValue={ticket.wartet_seit || ''}
              onChange={(e) => onDetail(ticket, { wartet_seit: e.target.value || null })}
              className={`${feld} w-44`}
            />
          </label>
          <label className={`${beschriftung} flex-1 min-w-[220px]`}>Worauf genau?
            <input
              type="text" placeholder="z. B. Freigabe Design, Texte, Zugangsdaten"
              defaultValue={ticket.wartet_worauf || ''}
              onBlur={(e) => {
                if (e.target.value !== (ticket.wartet_worauf || '')) onDetail(ticket, { wartet_worauf: e.target.value });
              }}
              className={feld}
            />
          </label>
          <p className="basis-full text-xs text-muted-foreground">Bleibt bei dir. Kommt auf die Liste zum Nachfassen.</p>
        </div>
      )}

      {antwort === 'zurueck' && (
        <div className="flex flex-wrap items-end gap-4 rounded bg-muted p-3">
          <label className={`${beschriftung} flex-1 min-w-[220px]`}>Zu wem gehört es? (freiwillig)
            <input
              type="text" placeholder="Name oder kurzer Hinweis"
              defaultValue={ticket.zurueck_hinweis || ''}
              onBlur={(e) => {
                if (e.target.value !== (ticket.zurueck_hinweis || '')) onDetail(ticket, { zurueck_hinweis: e.target.value });
              }}
              className={feld}
            />
          </label>
          <span className="pb-3 text-xs text-muted-foreground">Geht an den Projektverantwortlichen zur Neuverteilung.</span>
        </div>
      )}

      {antwort === 'entfaellt' && (
        <p className="rounded bg-muted p-3 text-xs text-muted-foreground">
          {darfArchivieren
            ? 'Archiviert. Gelöscht wird nichts, das Ticket lässt sich im Projekt wiederherstellen.'
            : 'Wird dem Projektverantwortlichen zum Archivieren vorgeschlagen. Gelöscht wird nichts.'}
        </p>
      )}
    </div>
  );
}
