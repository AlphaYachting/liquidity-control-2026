import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { RITTLER, STATUS_COLORS, fmtDate } from '@/components/sprint/sprintConfig';
import { projectTypeOf } from '@/components/sprint/projectTypes';

export const KARTE = 'bg-white rounded-lg border border-border px-5 py-[18px]';

export function Titel({ children, farbe = RITTLER.black, className = '' }) {
  return (
    <p className={`text-xs font-bold uppercase tracking-[1.5px] ${className}`} style={{ color: farbe }}>
      {children}
    </p>
  );
}

// Abschnitt der Hauptspalte — erscheint nur, wenn er etwas enthält.
export function Abschnitt({ titel, anzahl, farbe, hinweis, children }) {
  if (!anzahl) return null;
  return (
    <div className={KARTE}>
      <Titel farbe={farbe} className="mb-1">{titel} ({anzahl})</Titel>
      {hinweis && <p className="text-[12.5px] mb-2" style={{ color: RITTLER.textSecondary }}>{hinweis}</p>}
      {children}
    </div>
  );
}

// Einklappbarer Abschnitt (z. B. „Heute erledigt").
export function KlappAbschnitt({ titel, anzahl, children }) {
  const [offen, setOffen] = useState(false);
  if (!anzahl) return null;
  const Icon = offen ? ChevronDown : ChevronRight;
  return (
    <div className={KARTE}>
      <button type="button" onClick={() => setOffen((o) => !o)} className="flex items-center gap-2 w-full text-left">
        <Icon className="w-4 h-4" style={{ color: RITTLER.textSecondary }} />
        <Titel>{titel} ({anzahl})</Titel>
      </button>
      {offen && <div className="mt-2">{children}</div>}
    </div>
  );
}

// Zählerleiste: der ganze Tag auf einen Blick.
export function Zaehlerleiste({ werte }) {
  return (
    <div className="bg-white rounded-lg border border-border grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
      {werte.map((w) => (
        <div key={w.label} className="px-[18px] py-3.5 border-b lg:border-b-0 lg:border-r last:border-r-0 border-border">
          <p className="text-[26px] leading-tight font-extrabold tabular-nums" style={{ color: w.zahl && w.farbe ? w.farbe : RITTLER.black }}>
            {w.wert}
            {w.zusatz && <span className="text-sm font-semibold ml-1" style={{ color: RITTLER.textSecondary }}>{w.zusatz}</span>}
          </p>
          <p
            className="text-xs font-bold uppercase tracking-[1px]"
            style={{ color: w.zahl && w.farbe ? w.farbe : RITTLER.textSecondary }}
          >
            {w.label}
          </p>
        </div>
      ))}
    </div>
  );
}

// Zielseite einer Aufgabe — Sprintaufgaben öffnen die Etappe, alle anderen das Projekt am Leistungsbereich.
export function ticketZiel(ticket, milestone, project) {
  const istSprint = !project || projectTypeOf(project) === 'sprint';
  return istSprint || !milestone?.sprint_id
    ? `/sprint/milestones/${ticket.milestone_id}?aufgabe=${ticket.id}`
    : `/sprint/sprints/${milestone.sprint_id}${ticket.module_template_id ? `#modul-${ticket.module_template_id}` : ''}`;
}

// Schmale Liste für die rechte Spalte (Wartet, Kommt später).
export function KurzListe({ titel, farbe, hinweis, tickets, max = 5, heute, projektName, milestoneById, projectById, terminVorne = false, onOeffnen }) {
  const [alle, setAlle] = useState(false);
  if (!tickets.length) return null;
  const sichtbar = alle ? tickets : tickets.slice(0, max);
  const rest = tickets.length - sichtbar.length;
  return (
    <div className={KARTE}>
      <Titel farbe={farbe} className="mb-1">{titel} ({tickets.length})</Titel>
      {hinweis && <p className="text-[12.5px] mb-1" style={{ color: RITTLER.textSecondary }}>{hinweis}</p>}
      {sichtbar.map((t) => {
        const verpasst = !terminVorne && t.planned_for && t.planned_for < heute;
        return (
          <Link
            key={t.id}
            to={ticketZiel(t, milestoneById[t.milestone_id], projectById[t.project_id])}
            onClick={(e) => {
              if (!onOeffnen || e.metaKey || e.ctrlKey || e.shiftKey) return;
              e.preventDefault();
              onOeffnen(t);
            }}
            className="flex gap-3 py-2 px-2 -mx-2 rounded border-b border-border last:border-0 hover:bg-muted"
          >
            {terminVorne && (
              <span className="text-[12.5px] font-bold shrink-0 w-[52px] pt-0.5 tabular-nums" style={{ color: RITTLER.black }}>
                {fmtDate(t.planned_for).slice(0, 6)}
              </span>
            )}
            <span className="min-w-0">
              <span className="block text-sm font-semibold truncate" style={{ color: RITTLER.black }}>{t.title}</span>
              <span className="block text-[12.5px] truncate" style={{ color: RITTLER.textSecondary }}>
                {projektName(projectById[t.project_id])}
                {verpasst && (
                  <span className="font-bold" style={{ color: STATUS_COLORS.critical }}>
                    {' '}· Termin war {fmtDate(t.planned_for).slice(0, 6)}
                  </span>
                )}
              </span>
            </span>
          </Link>
        );
      })}
      {rest > 0 && (
        <button type="button" onClick={() => setAlle(true)} className="mt-1 text-[13px] font-semibold py-2" style={{ color: RITTLER.black }}>
          + {rest} weitere anzeigen
        </button>
      )}
    </div>
  );
}
