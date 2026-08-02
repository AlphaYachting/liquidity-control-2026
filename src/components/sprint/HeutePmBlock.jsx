import React from 'react';
import { Link } from 'react-router-dom';
import SectionLabel from '@/components/sprint/SectionLabel';
import { RITTLER, STATUS_COLORS, fmtDate } from '@/components/sprint/sprintConfig';

function Gruppe({ label, color, items }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color }}>{label} ({items.length})</p>
      {items.map(({ m, p, c, date }) => (
        <Link
          key={m.id}
          to={`/sprint/milestones/${m.id}`}
          className="flex items-center gap-3 py-1.5 hover:bg-[#f5f5f5]/60 px-2 -mx-2 rounded"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate" style={{ color: RITTLER.black, fontWeight: 500 }}>{m.title}</p>
            <p className="text-xs truncate" style={{ color: RITTLER.textSecondary }}>
              {[p?.title, c?.name].filter(Boolean).join(' · ')}
            </p>
          </div>
          {date && <span className="text-sm font-semibold shrink-0" style={{ color: RITTLER.black }}>{fmtDate(date)}</span>}
        </Link>
      ))}
    </div>
  );
}

// PM-Block der Heute-Ansicht: Etappen, die auf den Projektverantwortlichen warten.
export default function HeutePmBlock({ email, milestones, sprints, projects, clients, today }) {
  const pmProjectIds = new Set(projects.filter((p) => p.pm_email === email).map((p) => p.id));
  if (pmProjectIds.size === 0) return null;

  const sprintById = Object.fromEntries(sprints.map((s) => [s.id, s]));
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));
  const clientById = Object.fromEntries(clients.map((c) => [c.id, c]));

  const mine = milestones
    .filter((m) => m.state !== 'freigegeben')
    .map((m) => {
      const p = projectById[sprintById[m.sprint_id]?.project_id];
      return { m, p, c: p ? clientById[p.client_id] : null };
    })
    .filter((x) => x.p && pmProjectIds.has(x.p.id));

  const freezeReached = mine
    .filter(({ m }) => m.state === 'kundenfeedback' && m.feedback_deadline && m.feedback_deadline < today)
    .map((x) => ({ ...x, date: x.m.feedback_deadline }));
  const inFeedback = mine
    .filter(({ m }) => m.state === 'kundenfeedback' && m.feedback_deadline && m.feedback_deadline >= today)
    .map((x) => ({ ...x, date: x.m.feedback_deadline }));
  const overdueHandover = mine
    .filter(({ m }) => m.state !== 'kundenfeedback' && !m.handover_date && m.planned_handover && m.planned_handover < today)
    .map((x) => ({ ...x, date: x.m.planned_handover }));

  if (freezeReached.length === 0 && inFeedback.length === 0 && overdueHandover.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-sm p-5 space-y-4">
      <SectionLabel>Wartet auf mich als Projektverantwortlichen</SectionLabel>
      <Gruppe label="Frist abgelaufen — Freigabe dokumentieren" color={STATUS_COLORS.critical} items={freezeReached} />
      <Gruppe label="Übergabe überfällig" color={STATUS_COLORS.attention} items={overdueHandover} />
      <Gruppe label="Beim Kunden im Feedback" color={RITTLER.textSecondary} items={inFeedback} />
    </div>
  );
}