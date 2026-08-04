import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');

// Zeigt, wer zuletzt Zeit auf das awork-Projekt gebucht hat —
// die Ansprechpersonen für eine Fertigstellungs-Einschätzung.
export default function AworkLastBookers({ aworkProjectId }) {
  const { data: entries = [] } = useQuery({
    queryKey: ['awork-last-bookers', aworkProjectId],
    queryFn: () => base44.entities.AworkTimeEntry.filter({ awork_project_id: aworkProjectId }, '-entry_date', 30),
    enabled: !!aworkProjectId,
    staleTime: 5 * 60 * 1000,
  });

  if (!aworkProjectId || entries.length === 0) return null;

  // letzte 3 unterschiedliche Personen mit ihrem jeweils letzten Buchungstag
  const seen = new Map();
  for (const e of entries) {
    const name = e.user_name || 'Unbekannt';
    if (!seen.has(name)) seen.set(name, e.entry_date);
    if (seen.size >= 3) break;
  }

  return (
    <div className="flex items-center gap-2 text-xs flex-wrap border-t border-blue-100 pt-2">
      <span className="text-blue-800 font-medium shrink-0">Zuletzt gebucht:</span>
      {[...seen.entries()].map(([name, date], i) => (
        <span
          key={name}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border ${
            i === 0 ? 'bg-white text-blue-900 border-blue-300 font-semibold' : 'bg-white/60 text-blue-800 border-blue-100'
          }`}
        >
          {name}
          <span className="text-blue-600/70 font-normal">{fmtDate(date)}</span>
        </span>
      ))}
    </div>
  );
}