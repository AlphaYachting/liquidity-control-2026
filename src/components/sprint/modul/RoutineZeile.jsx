import React, { useState } from 'react';
import FaelligkeitKnopf from '@/components/sprint/FaelligkeitKnopf';
import TicketStatusElement from '@/components/sprint/TicketStatusElement';
import PersonenChip from '@/components/sprint/PersonenChip';
import { RITTLER, STATUS_COLORS, fmtDate, todayIso } from '@/components/sprint/sprintConfig';
import { istUeberfaellig } from '@/lib/sprint/faelligkeit';
import { personenVon, namenVon } from '@/lib/sprint/zustaendige';
import { routineFortsetzen } from '@/lib/sprint/routine';
import TicketDetailPanel from '@/components/sprint/ticket/TicketDetailPanel';

const RHYTHMUS = { woechentlich: 'wöchentlich', '14taegig': 'alle 14 Tage', monatlich: 'monatlich', '2monatlich': 'alle 2 Monate', quartalsweise: 'quartalsweise', halbjaehrlich: 'halbjährlich', jaehrlich: 'jährlich', manuell: 'manuell' };

// Eine Zeile je Routine-Kette: offenes Ticket plus aufklappbarer Verlauf.
// darfRoutine: Projektleitung, Führung, Admins — dürfen eine abgerissene Kette fortsetzen (29.10.2026).
// beendet: Kette wurde über „Routine beenden“ bewusst abgeschlossen — kein Fortsetzen-Knopf.
export default function RoutineZeile({ kette, members, myEmail, onStatus, onAssignee, onRefresh, darfRoutine = false, beendet = false }) {
  const [offen, setOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  // Klick auf den Titel öffnet die laufende Instanz im Seitenfenster (dort u. a. „Wiederkehrend“)
  const [detailOpen, setDetailOpen] = useState(false);
  const aktuell = kette.find((t) => t.status !== 'erledigt');
  const erledigt = kette.filter((t) => t.status === 'erledigt')
    .sort((a, b) => (b.last_status_change || '').localeCompare(a.last_status_change || ''));
  const ref = aktuell || kette[0];

  const heute = todayIso();
  const ueberfaellig = !!aktuell && istUeberfaellig(aktuell, heute);
  const bald = new Date(); bald.setDate(bald.getDate() + 2);
  const baldIso = `${bald.getFullYear()}-${String(bald.getMonth() + 1).padStart(2, '0')}-${String(bald.getDate()).padStart(2, '0')}`;
  const faellig = !!aktuell && !ueberfaellig && !!aktuell.planned_for && aktuell.planned_for <= baldIso;

  return (
    <div
      className={`border-b border-border last:border-0 py-2 pr-2 ${ueberfaellig ? 'bg-status-critical-surface' : faellig ? 'bg-status-attention-surface/60' : ''}`}
      style={{ paddingLeft: 12, borderLeft: ueberfaellig ? `4px solid ${STATUS_COLORS.critical}` : faellig ? `3px solid ${STATUS_COLORS.attention}` : '3px solid transparent' }}
    >
      <div className="flex items-center gap-3">
        {aktuell && (
          <PersonenChip
            zustaendige={personenVon(aktuell, members)}
            currentUserEmail={myEmail}
            members={members}
            role={aktuell.role}
            onToggle={(email, war) => onAssignee(aktuell, war ? { weg: email } : { dazu: email })}
            onLeeren={() => onAssignee(aktuell, { setzen: [] })}
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate flex items-center gap-1.5" style={{ color: RITTLER.black }}>
            {aktuell ? (
              <button type="button" onClick={() => setDetailOpen(true)} className="truncate text-left hover:underline">{ref.title}</button>
            ) : (
              <span className="truncate">{ref.title}</span>
            )}
            {ueberfaellig && <span className="shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-status-critical text-primary-foreground">Überfällig</span>}
            {faellig && <span className="shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-status-attention-surface text-status-attention">Fällig</span>}
          </p>
          <p className="text-xs text-muted-foreground">{RHYTHMUS[ref.rhythmus] || 'manuell'}</p>
        </div>
        {aktuell ? (
          <>
            <FaelligkeitKnopf ticket={aktuell} />
            <TicketStatusElement value={aktuell.status} onChange={(s) => onStatus(aktuell, s)} />
          </>
        ) : beendet ? (
          <span className="text-xs font-medium text-muted-foreground">beendet</span>
        ) : darfRoutine && erledigt.length ? (
          <button
            type="button"
            disabled={laeuft}
            onClick={async () => {
              setLaeuft(true);
              try { await routineFortsetzen(erledigt[0]); } finally { setLaeuft(false); }
              onRefresh?.();
            }}
            className="text-xs font-semibold px-2.5 py-1 rounded border border-border hover:bg-muted disabled:opacity-60"
            title="Nächste Runde anlegen — Termin automatisch nach Rhythmus"
          >
            {laeuft ? 'Legt an…' : 'Routine fortsetzen'}
          </button>
        ) : (
          <span className="text-xs font-medium" style={{ color: STATUS_COLORS.attention }}>keine Fälligkeit</span>
        )}
        <button
          type="button"
          disabled={!erledigt.length}
          onClick={() => setOffen((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground w-20 text-right disabled:hover:text-muted-foreground"
        >
          {erledigt.length} × erledigt
        </button>
      </div>
      {offen && (
        <ul className="mt-2 ml-10 space-y-0.5">
          {erledigt.map((t) => (
            <li key={t.id} className="text-xs text-muted-foreground">
              {fmtDate(t.last_status_change)} · {namenVon(t, members, '—')}
            </li>
          ))}
        </ul>
      )}
      {aktuell && (
        <TicketDetailPanel
          ticket={aktuell}
          members={members}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          onSaved={() => onRefresh?.()}
        />
      )}
    </div>
  );
}