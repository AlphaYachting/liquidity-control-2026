import React from 'react';
import SectionLabel from '@/components/sprint/SectionLabel';
import HeuteAufgabenZeile from '@/components/sprint/HeuteAufgabenZeile';
import { STATUS_COLORS, RITTLER } from '@/components/sprint/sprintConfig';
import { istUeberfaellig, istFaellig } from '@/lib/sprint/faelligkeit';

// Block „Wiederkehrend“: fällige Routinen über alle Projekte.
export default function HeuteRoutinen({ tickets, today, projectById, clientById, milestoneById, onStatusChange }) {
  const routinen = tickets.filter((t) => t.rhythmus);
  const kunde = (t) => clientById[projectById[t.project_id]?.client_id]?.name || '';
  const offen = routinen
    .filter((t) => t.status !== 'erledigt' && (istFaellig(t, today) || istUeberfaellig(t, today)))
    .map((t) => ({ t, ue: istUeberfaellig(t, today) }))
    .sort((a, b) => (b.ue - a.ue) || kunde(a.t).localeCompare(kunde(b.t))
      || (a.t.planned_for || '').localeCompare(b.t.planned_for || ''));
  const erledigt = routinen.filter((t) => t.status === 'erledigt');
  if (!offen.length && !erledigt.length) return null;
  const anzahlUe = offen.filter((o) => o.ue).length;

  const zeile = (t) => (
    <HeuteAufgabenZeile
      key={t.id}
      ticket={t}
      milestone={milestoneById[t.milestone_id]}
      projectLabel={[kunde(t), projectById[t.project_id]?.title].filter(Boolean).join(' · ')}
      onStatusChange={onStatusChange}
    />
  );

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <SectionLabel className="mb-2">Wiederkehrend ({offen.length})</SectionLabel>
      {anzahlUe > 0 && (
        <p className="text-xs font-bold mb-2" style={{ color: STATUS_COLORS.critical }}>{anzahlUe} überfällig</p>
      )}
      {offen.map((o) => zeile(o.t))}
      {erledigt.length > 0 && (
        <div className="mt-3">
          <p className="text-xs mb-1" style={{ color: RITTLER.textSecondary }}>Heute erledigt ({erledigt.length})</p>
          {erledigt.map(zeile)}
        </div>
      )}
    </div>
  );
}