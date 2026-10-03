import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { TypKuerzel } from '@/components/sprint/heute/MeinTagZeile';
import { RITTLER } from '@/components/sprint/sprintConfig';

const fmtH = (v) => new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 }).format(v || 0);
const VORSCHAU = 3;

// „7 × Umsetzung Anpassung, 7 × Kurz-QS & Live" — nur wenn sich der Rest in wenigen Titeln zusammenfassen lässt
function restText(tickets) {
  const zahl = new Map();
  tickets.forEach((t) => zahl.set(t.title, (zahl.get(t.title) || 0) + 1));
  if (zahl.size > 3 || zahl.size === tickets.length) return '';
  return [...zahl.entries()].map(([titel, n]) => `${n} × ${titel}`).join(', ');
}

function Gruppe({ gruppe, projektName, projektZiel, zeile, istFocus }) {
  const [alle, setAlle] = useState(false);
  const { project, tickets, stunden } = gruppe;
  const sichtbar = alle ? tickets : tickets.slice(0, VORSCHAU);
  const rest = tickets.slice(sichtbar.length);
  const zusammen = restText(rest);
  return (
    <div className="mt-3.5 first:mt-0">
      <div className="flex flex-wrap items-center gap-2.5 px-3 py-2.5 rounded" style={{ backgroundColor: '#f5f5f5' }}>
        <Link to={projektZiel(project)} className="text-sm font-bold hover:underline min-w-0 truncate" style={{ color: RITTLER.black }}>
          {projektName(project)}
        </Link>
        <TypKuerzel project={project} />
        {istFocus && (
          <span className="text-[11px] font-bold px-[7px] py-[3px] rounded-[2px] border" style={{ color: RITTLER.black, borderColor: RITTLER.black }}>
            Focus heute
          </span>
        )}
        <span className="ml-auto text-[12.5px] shrink-0" style={{ color: RITTLER.textSecondary }}>
          {tickets.length} {tickets.length === 1 ? 'Aufgabe' : 'Aufgaben'}{stunden > 0 ? ` · ${fmtH(stunden)} h Ziel` : ''}
        </span>
      </div>
      {sichtbar.map(zeile)}
      {rest.length > 0 && (
        <button type="button" onClick={() => setAlle(true)} className="w-full min-h-[44px] text-left px-3 text-[13px] font-semibold" style={{ color: RITTLER.black }}>
          + {rest.length} weitere anzeigen
          {zusammen && <span className="font-normal" style={{ color: RITTLER.textSecondary }}> ({zusammen})</span>}
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
