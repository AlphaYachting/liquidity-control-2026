import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import Ampelpunkt from '@/components/sprint/Ampelpunkt';
import PersonenStapel from '@/components/sprint/PersonenStapel';
import TypPill from '@/components/sprint/TypPill';
import { projectTypeOf } from '@/components/sprint/projectTypes';
import { h1 } from '@/lib/sprint/behaelterZahlen';
import { RITTLER, STATUS_COLORS, fmtEUR } from '@/components/sprint/sprintConfig';

const AMPEL_COLOR = { plan: 'transparent', attention: STATUS_COLORS.attention, action: STATUS_COLORS.critical };
const AMPEL_SHAPE = { plan: 'plan', attention: 'attention', action: 'critical' };

// Projektzeile für Container, Support, Regie, Intern, Alt — gleiches Raster wie ProjektZeile.
export default function BehaelterZeile({ sprint, project, client, status, people = [], currentUserEmail, onEdit }) {
  const navigate = useNavigate();
  const ziel = sprint ? `/sprint/sprints/${sprint.id}` : null;
  const typ = projectTypeOf(project);
  const n = status.naechste;
  const frist = n
    ? status.naechsteTage < 0 ? `${-status.naechsteTage} Tage über` : status.naechsteTage === 0 ? 'heute fällig' : `in ${status.naechsteTage} Tagen`
    : null;

  // Pauschalprojekt: Budgetstunden und Auftragssumme statt Monatsstunden
  const b = status.budget;
  const geld = typ === 'legacy' && b
    ? `${b.gesamt ? `${h1(b.gebucht)} von ${h1(b.gesamt)} h` : `${h1(b.gebucht)} h · Budget fehlt`}${b.betrag ? ` · ${fmtEUR(b.betrag)}` : ''}`
    : typ === 'container'
    ? `${status.kontingent ? `${h1(status.stunden)} von ${status.kontingent} h` : `${h1(status.stunden)} h`}${status.pauschale ? ` · ${fmtEUR(status.pauschale)}/Monat` : ''}`
    : typ === 'support' || typ === 'regie'
      ? `${h1(status.verrechenbar)} h verrechenbar${status.stundensatz ? ` · ${fmtEUR(status.verrechenbar * status.stundensatz)}` : ''}`
      : `${h1(status.stunden)} h diesen Monat`;

  const oeffne = (e, pfad) => { e.stopPropagation(); if (pfad) navigate(pfad); };

  return (
    <div
      onClick={(e) => oeffne(e, ziel)}
      title={status.ampelGrund}
      className={`${ziel ? 'cursor-pointer hover:bg-[#fafafa]' : ''} border-b border-[#eeeeee] last:border-0`}
      style={{ borderLeft: `3px solid ${AMPEL_COLOR[status.ampel]}` }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <Ampelpunkt status={AMPEL_SHAPE[status.ampel]} />
        <TypPill project={project} />
        <div className="flex-1 min-w-0">
          <p className="text-[17px] font-medium truncate" style={{ color: RITTLER.black }}>{project?.title || 'Projekt'}</p>
          <p className="text-[12px] uppercase tracking-[0.5px] truncate" style={{ color: RITTLER.textSecondary }}>{client?.name || 'Kunde'}</p>
        </div>

        <div className="hidden md:block w-[72px] shrink-0">
          <PersonenStapel members={people} currentUserEmail={currentUserEmail} />
        </div>

        <div className="w-[230px] shrink-0 text-right min-w-0">
          {n ? (
            <button type="button" onClick={(e) => oeffne(e, ziel && `${ziel}?aufgabe=${n.id}`)} className="block w-full text-right hover:underline">
              <p className="text-[15px] font-semibold truncate" style={{ color: status.ampel === 'plan' ? RITTLER.black : AMPEL_COLOR[status.ampel] }}>
                {n.title}
              </p>
              <p className="text-[13px]" style={{ color: RITTLER.textSecondary }}>
                {frist}{status.weitereUeberfaellig ? ` · +${status.weitereUeberfaellig} weitere überfällig` : ''}
              </p>
            </button>
          ) : (
            <p className="text-[13px]" style={{ color: RITTLER.textSecondary }}>Nichts fällig</p>
          )}
        </div>

        <div className="hidden sm:block w-[110px] shrink-0 text-right">
          <p className="text-[15px] font-semibold" style={{ color: RITTLER.black }}>{status.monatErledigt} von {status.monatGesamt}</p>
          <p className="text-[13px]" style={{ color: RITTLER.textSecondary }}>diesen Monat</p>
        </div>

        <div className="hidden lg:block w-[150px] shrink-0 text-right">
          <p
            className="text-[13px]"
            style={{ color: b?.anteil > 1 ? STATUS_COLORS.critical : b?.anteil >= 0.8 ? STATUS_COLORS.attention : RITTLER.textSecondary }}
          >
            {geld}
          </p>
        </div>

        {onEdit && (
          <button type="button" title="Stammdaten bearbeiten" onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="shrink-0 h-8 w-8 flex items-center justify-center rounded hover:bg-muted">
            <Pencil className="w-3.5 h-3.5" style={{ color: RITTLER.textSecondary }} />
          </button>
        )}
      </div>
    </div>
  );
}