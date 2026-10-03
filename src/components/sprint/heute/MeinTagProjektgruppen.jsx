import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { TypKuerzel } from '@/components/sprint/heute/MeinTagZeile';
import { RITTLER } from '@/components/sprint/sprintConfig';

const fmtH = (v) => new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 }).format(v || 0);
const PROJEKTE_VORSCHAU = 8;
const AUFGABEN_VORSCHAU = 8;
// Ab dieser Menge wird die Suche angeboten
const SUCHE_AB = 6;

function Gruppe({ gruppe, offen, onToggle, projektName, projektZiel, zeile, istFocus }) {
  const [alle, setAlle] = useState(false);
  const { project, tickets, stunden, inArbeit } = gruppe;
  const sichtbar = alle ? tickets : tickets.slice(0, AUFGABEN_VORSCHAU);
  const rest = tickets.length - sichtbar.length;
  const Icon = offen ? ChevronDown : ChevronRight;
  const zahlen = [
    inArbeit > 0 ? `${inArbeit} in Arbeit` : null,
    tickets.length - inArbeit > 0 ? `${tickets.length - inArbeit} offen` : null,
    stunden > 0 ? `${fmtH(stunden)} h Ziel` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={offen}
        className="w-full min-h-[44px] flex flex-wrap items-center gap-x-2.5 gap-y-0.5 px-2 py-1.5 text-left rounded hover:bg-muted"
        style={offen ? { backgroundColor: '#f5f5f5' } : undefined}
      >
        <Icon className="w-4 h-4 shrink-0" style={{ color: RITTLER.textSecondary }} />
        <span className="text-sm font-bold min-w-0 truncate" style={{ color: RITTLER.black }}>{projektName(project)}</span>
        <TypKuerzel project={project} />
        {istFocus && (
          <span className="text-[11px] font-bold px-[7px] py-[3px] rounded-[2px] border" style={{ color: RITTLER.black, borderColor: RITTLER.black }}>
            Focus heute
          </span>
        )}
        <span className="ml-auto text-[12.5px] shrink-0" style={{ color: RITTLER.textSecondary }}>{zahlen}</span>
      </button>
      {offen && (
        <div className="pl-6 pb-2">
          {sichtbar.map(zeile)}
          <div className="flex flex-wrap items-center gap-x-4 px-1">
            {rest > 0 && (
              <button type="button" onClick={() => setAlle(true)} className="min-h-[40px] text-[13px] font-semibold" style={{ color: RITTLER.black }}>
                + {rest} weitere anzeigen
              </button>
            )}
            <Link to={projektZiel(project)} className="min-h-[40px] inline-flex items-center text-[13px] underline" style={{ color: RITTLER.textSecondary }}>
              Zum Projekt
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// Aufgaben ohne Termin als Vorrat: je Projekt eine Zeile, die Aufgaben erst beim Aufklappen.
// So bleibt „Mein Tag" kurz, auch wenn jemand hunderte offene Aufgaben hat.
export default function MeinTagProjektgruppen({ gruppen, projektName, projektZiel, zeile, focusProjectId }) {
  const [suche, setSuche] = useState('');
  const [alleProjekte, setAlleProjekte] = useState(false);
  const [offen, setOffen] = useState(() => new Set(gruppen.length === 1 ? [gruppen[0].projectId] : []));

  const q = suche.trim().toLowerCase();
  const gefiltert = !q ? gruppen : gruppen.map((g) => {
    if (projektName(g.project).toLowerCase().includes(q)) return g;
    const treffer = g.tickets.filter((t) => (t.title || '').toLowerCase().includes(q));
    return treffer.length
      ? { ...g, tickets: treffer, inArbeit: treffer.filter((t) => t.status === 'in_arbeit').length, aufgabenTreffer: true }
      : null;
  }).filter(Boolean);

  const sichtbar = q || alleProjekte ? gefiltert : gefiltert.slice(0, PROJEKTE_VORSCHAU);
  const rest = gefiltert.length - sichtbar.length;
  const toggle = (id) => setOffen((alt) => {
    const neu = new Set(alt);
    if (neu.has(id)) neu.delete(id); else neu.add(id);
    return neu;
  });

  return (
    <div>
      {gruppen.length >= SUCHE_AB && (
        <div className="flex items-center gap-2 h-10 px-3 mb-2 rounded border border-input bg-white">
          <Search className="w-4 h-4 shrink-0" style={{ color: RITTLER.textSecondary }} />
          <input
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Projekt oder Aufgabe suchen …"
            aria-label="Projekt oder Aufgabe suchen"
            className="flex-1 bg-transparent outline-none text-sm"
          />
        </div>
      )}
      {q && gefiltert.length === 0 && (
        <p className="text-sm py-2" style={{ color: RITTLER.textSecondary }}>Nichts gefunden.</p>
      )}
      {sichtbar.map((g) => (
        <Gruppe
          key={g.projectId}
          gruppe={g}
          // Bei der Suche klappen Treffer in Aufgaben von selbst auf
          offen={offen.has(g.projectId) || (!!q && (g.aufgabenTreffer || gefiltert.length <= 3))}
          onToggle={() => toggle(g.projectId)}
          projektName={projektName}
          projektZiel={projektZiel}
          zeile={zeile}
          istFocus={!!focusProjectId && g.projectId === focusProjectId}
        />
      ))}
      {rest > 0 && (
        <button type="button" onClick={() => setAlleProjekte(true)} className="w-full min-h-[44px] text-left px-2 text-[13px] font-semibold" style={{ color: RITTLER.black }}>
          + {rest} weitere Projekte anzeigen
        </button>
      )}
    </div>
  );
}
