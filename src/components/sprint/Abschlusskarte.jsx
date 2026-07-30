import React from 'react';
import { Link } from 'react-router-dom';
import { Check, Lock } from 'lucide-react';
import { RITTLER, STATUS_COLORS, fmtEUR, fmtDate } from '@/components/sprint/sprintConfig';

// K7 — freigegebene Etappe: die präsenteste Karte des Screens, niemals ausgegraut.
export default function Abschlusskarte({ milestone, approval }) {
  const approvedAt = approval?.approved_at || milestone.updated_date;
  const art = approval?.approval_type === 'stillschweigend'
    ? 'stillschweigend nach Fristablauf'
    : approval ? 'aktiv freigegeben' : 'Freigabeart nicht dokumentiert';

  return (
    <div
      className="rounded-lg p-5"
      style={{ backgroundColor: STATUS_COLORS.doneSurface, borderLeft: `4px solid ${STATUS_COLORS.doneText}` }}
    >
      <div className="flex items-start gap-2">
        <Check className="w-5 h-5 mt-0.5 shrink-0" strokeWidth={3} style={{ color: STATUS_COLORS.doneText }} />
        <Lock className="w-4 h-4 mt-1 shrink-0" style={{ color: STATUS_COLORS.doneText }} />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base" style={{ color: RITTLER.black }}>{milestone.title}</p>
          <p className="text-base font-bold mt-0.5" style={{ color: STATUS_COLORS.doneText }}>
            Freigegeben am {fmtDate(approvedAt)} · {fmtEUR(milestone.milestone_amount)} abgeschlossen
          </p>
          <p className="text-xs mt-1" style={{ color: RITTLER.textSecondary }}>{art}</p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Link
              to={`/sprint/milestones/${milestone.id}`}
              className="text-sm font-bold hover:underline"
              style={{ color: RITTLER.pink700 }}
            >
              Eingefrorenen Stand ansehen
            </Link>
            <div>
              <button type="button" disabled className="text-sm font-bold cursor-not-allowed" style={{ color: RITTLER.textSecondary }}>
                Change Request anlegen
              </button>
              <p className="text-[11px]" style={{ color: RITTLER.textSecondary }}>Change Requests folgen in Block B.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}