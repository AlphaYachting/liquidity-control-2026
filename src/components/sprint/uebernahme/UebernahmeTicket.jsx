import React from 'react';
import { ANTWORTEN, WARTET_AUF, herkunft, istBestaetigt } from '@/lib/sprint/uebernahme';

const feld = 'h-10 rounded border border-[#d4d4d4] bg-white px-3 text-sm text-foreground';
const beschriftung = 'flex flex-col gap-1 text-xs font-semibold text-muted-foreground';
const kurz = (s, n) => (s.length > n ? `${s.slice(0, n).trimEnd()} …` : s);

// Ein Ticket der Übernahme: Titel, Herkunft aus aWork, sechs Antworten — ein Klick speichert sofort.
// Rechts lässt es sich direkt an eine Person weitergeben. Zusatzangaben klappen je nach Antwort auf.
export default function UebernahmeTicket({
  ticket, geerbt, laeuft, fehler, darfArchivieren, members, onAntwort, onDetail, onWeitergeben,
}) {
  const antwort = istBestaetigt(ticket) ? ticket.uebernahme_antwort : null;
  const meins = antwort === 'offen' || antwort === 'in_arbeit';
  const h = herkunft(ticket);
  // „Oberaufgabe › Unteraufgabe" — die Unteraufgabe ist das, was zu tun ist
  const teile = (ticket.title || '').split(' › ');
  const titel = teile[teile.length - 1];
  const ober = teile.length > 1 ? teile.slice(0, -1).join(' › ') : '';
  const meta = [
    geerbt && (h.zugewiesen.length ? `in aWork bei ${h.zugewiesen.join(', ')}` : 'in aWork niemandem zugeteilt'),
    h.statusDort && `dort: ${h.statusDort}`,
    ticket.target_hours ? `geplant ${ticket.target_hours} h` : null,
    ticket.planned_for ? `fällig ${new Date(`${ticket.planned_for}T00:00:00`).toLocaleDateString('de-AT')}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className={`border-t border-border px-4 py-3 first:border-t-0 ${antwort ? 'bg-muted/40' : 'bg-white'}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-72">
          {ober && <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{ober}</p>}
          <p className="text-[15px] font-semibold leading-snug text-foreground">{titel}</p>
          {meta && <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>}
          {h.text && <p className="mt-1 text-[13px] leading-snug text-foreground/80">{kurz(h.text, 180)}</p>}
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          Weitergeben an
          <select
            value="" disabled={laeuft}
            onChange={(e) => e.target.value && onWeitergeben(ticket, e.target.value)}
            className="h-9 rounded border border-[#d4d4d4] bg-white px-2 text-[13px] font-normal text-foreground"
          >
            <option value="">Person …</option>
            {members.map((m) => <option key={m.email} value={m.email}>{m.name}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {ANTWORTEN.map((a) => {
          const an = antwort === a.wert;
          return (
            <button
              key={a.wert}
              type="button"
              aria-pressed={an}
              disabled={laeuft}
              onClick={() => onAntwort(ticket, a.wert)}
              className={`min-h-[36px] px-3 rounded border text-[13px] disabled:opacity-60 ${an
                ? 'bg-foreground text-background border-foreground font-semibold'
                : 'bg-white text-foreground border-[#d4d4d4] font-medium hover:bg-muted'}`}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      {fehler && <p className="mt-2 text-xs text-status-critical">{fehler}</p>}

      {meins && (
        <div className="mt-2 flex flex-wrap items-end gap-4 rounded bg-muted p-3">
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
          <span className="pb-2.5 text-xs text-muted-foreground">Beides freiwillig, hilft aber bei der Planung.</span>
        </div>
      )}

      {antwort === 'wartet' && (
        <div className="mt-2 flex flex-wrap items-end gap-4 rounded bg-muted p-3">
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
        <div className="mt-2 flex flex-wrap items-end gap-4 rounded bg-muted p-3">
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
          <span className="pb-2.5 text-xs text-muted-foreground">Liegt im Topf, der Projektverantwortliche verteilt neu.</span>
        </div>
      )}

      {antwort === 'entfaellt' && (
        <p className="mt-2 rounded bg-muted p-3 text-xs text-muted-foreground">
          {darfArchivieren
            ? 'Archiviert. Gelöscht wird nichts, das Ticket lässt sich im Projekt wiederherstellen.'
            : 'Wird dem Projektverantwortlichen zum Archivieren vorgeschlagen. Gelöscht wird nichts.'}
        </p>
      )}
    </div>
  );
}
