import React from 'react';
import { Link } from 'react-router-dom';
import SectionLabel from '@/components/sprint/SectionLabel';
import { RITTLER, STATUS_COLORS, fmtDate } from '@/components/sprint/sprintConfig';

const daysLabel = (days) => {
  if (days === 0) return 'heute';
  if (days === 1) return 'morgen';
  return `in ${days} Tagen`;
};

// Nächste Fristen mit Projekt/Kunde und Dringlichkeitssignal.
export default function HeuteFristen({ deadlines }) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-5">
      <SectionLabel className="mb-3">Meine nächsten drei Fristen</SectionLabel>
      {deadlines.length > 0 ? (
        <div className="space-y-1">
          {deadlines.map(({ m, project, client, days, planned, deadline }) => {
            const color = days <= 2 ? STATUS_COLORS.critical : days <= 5 ? STATUS_COLORS.attention : RITTLER.textSecondary;
            const surface = days <= 2 ? STATUS_COLORS.criticalSurface : days <= 5 ? STATUS_COLORS.attentionSurface : RITTLER.surface;
            return (
              <Link
                key={m.id}
                to={`/sprint/milestones/${m.id}`}
                className="flex items-center gap-3 py-1.5 hover:bg-[#f5f5f5]/60 px-2 -mx-2 rounded"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: RITTLER.black, fontWeight: 500 }}>
                    {m.title}
                    {planned && <span className="text-[11px] ml-2" style={{ color: RITTLER.textSecondary }}>geplant</span>}
                  </p>
                  {(project || client) && (
                    <p className="text-xs truncate" style={{ color: RITTLER.textSecondary }}>
                      {[project?.title, client?.name].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-[2px] shrink-0"
                  style={{ color, backgroundColor: surface }}
                >
                  {daysLabel(days)}
                </span>
                <span className="text-sm font-semibold shrink-0" style={{ color: RITTLER.black }}>{fmtDate(deadline)}</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="text-sm" style={{ color: RITTLER.textSecondary }}>Alles im Plan — keine Frist in Sicht.</p>
      )}
    </div>
  );
}