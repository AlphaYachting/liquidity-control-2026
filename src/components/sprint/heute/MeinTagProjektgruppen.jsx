import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import TypPill from '@/components/sprint/TypPill';
import { RITTLER } from '@/components/sprint/sprintConfig';

const fmtH = (v) => new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 }).format(v || 0);
const VORSCHAU = 3;

function Gruppe({ gruppe, projektName, projektZiel, zeile, istFocus }) {
  const [alle, setAlle] = useState(false);
  const { project, tickets, stunden } = gruppe;
  const sichtbar = alle ? tickets : tickets.slice(0, VORSCHAU);
  const rest = tickets.length - sichtbar.length;
  return (
    <div className="mt-3 first:mt-0">
      <div className="flex flex-wrap items-center gap-2.5 px-3 py-2 rounded" style={{ backgroundColor: RITTLER.surface }}>
        <Link to={projektZiel(project)} className="text-sm font-bold hover:underline min-w-0 truncate" style={{ color: RITTLER.black }}>
          {projektName(project)}
        </Link>
        {project && <TypPill project={project} />}
        {istFocus && (
          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-[2px] border" style={{ color: RITTLER.black, borderColor: RITTLER.black }}>
            Focus heute
          </span>
        )}
        <span className="ml-auto text-xs shrink-0" style={{ color: RITTLER.textSecondary }}>
          {tickets.length} {tickets.length === 1 ? 'Aufgabe' : 'Aufgaben'}{stunden > 0 ? ` · ${fmtH(stunden)} h Ziel` : ''}
        </span>
      </div>
      {sichtbar.map(zeile)}
      {rest > 0 && (
        <button type="button" onClick={() => setAlle(true)} className="text-xs font-semibold py-2 px-3" style={{ color: RITTLER.black }}>
          + {rest} weitere anzeigen
        </button>
      )}
    </div>
  );
}

// Aufgaben ohne Termin, je Projekt gebündelt — damit 30 Aufgaben nicht als eine lange Liste erscheinen.
export default function MeinTagProjektgruppen({ gruppen, projektName, projektZiel, zeile, focusProjectId }) {
  return gruppen.map((g) => (
    <Gruppe
      key={g.projectId}
      gruppe={g}
      projektName={projektName}
      projektZiel={projektZiel}
      zeile={zeile}
      istFocus={!!focusProjectId && g.projectId === focusProjectId}
    />
  ));
}
