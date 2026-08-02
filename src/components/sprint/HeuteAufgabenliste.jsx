import React from 'react';
import { Check } from 'lucide-react';
import HeuteAufgabenZeile from '@/components/sprint/HeuteAufgabenZeile';
import { RITTLER } from '@/components/sprint/sprintConfig';

// U5 — Erledigtes verschwindet nicht und wird nie ausgegraut; es rutscht unter "GESCHAFFT".
export default function HeuteAufgabenliste({
  tickets,
  projectTitle,
  emptyText = 'Keine Aufgaben.',
  milestoneById = {},
  projectById = {},
  showProject = false,
  onStatusChange,
}) {
  const done = tickets.filter((t) => t.status === 'erledigt');
  const open = tickets.filter((t) => t.status !== 'erledigt');
  const tagGeschafft = tickets.length > 0 && open.length === 0;

  const row = (t) => (
    <HeuteAufgabenZeile
      key={t.id}
      ticket={t}
      milestone={milestoneById[t.milestone_id]}
      projectLabel={showProject ? projectById[t.project_id]?.title : null}
      onStatusChange={onStatusChange}
    />
  );

  return (
    <div>
      {tickets.length === 0 && <p className="text-sm" style={{ color: RITTLER.textSecondary }}>{emptyText}</p>}

      {tagGeschafft ? (
        <div className="py-10 text-center">
          <Check className="w-14 h-14 mx-auto" strokeWidth={3} style={{ color: RITTLER.black }} />
          <p className="mt-4 text-xl font-extrabold uppercase tracking-tight" style={{ color: RITTLER.black }}>
            Tag geschafft
          </p>
          <p className="mt-1 text-sm" style={{ color: RITTLER.textSecondary }}>
            {done.length} {done.length === 1 ? 'Aufgabe' : 'Aufgaben'} erledigt{projectTitle ? ` · ${projectTitle}` : ''}
          </p>
        </div>
      ) : (
        open.map(row)
      )}

      {done.length > 0 && (
        <div className="mt-5 pt-3 border-t" style={{ borderColor: RITTLER.line }}>
          <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: RITTLER.black }}>
            Geschafft ({done.length})
          </p>
          {done.map(row)}
        </div>
      )}
    </div>
  );
}