import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { kuerzelOf } from '@/lib/sprint/useTimer';

// Ruhezustand: Projekt wählen, Timer startet sofort.
export default function TimerStart({ onStart }) {
  const [suche, setSuche] = useState('');

  const { data } = useQuery({
    queryKey: ['timerProjects'],
    queryFn: async () => {
      const [projects, clients] = await Promise.all([
        base44.entities.Project.filter({ status: 'aktiv' }, 'title', 200),
        base44.entities.Client.list('name', 300),
      ]);
      const byId = Object.fromEntries(clients.map((c) => [c.id, c]));
      return projects.map((p) => ({ ...p, clientName: byId[p.client_id]?.name || '' }));
    },
  });

  const treffer = (data || []).filter((p) =>
    `${p.title} ${p.clientName}`.toLowerCase().includes(suche.toLowerCase())
  );

  return (
    <div className="p-5">
      <p className="text-[11px] font-bold uppercase tracking-[2px]" style={{ color: RITTLER.textSecondary }}>
        Zeit erfassen
      </p>
      <Input
        autoFocus
        placeholder="Projekt suchen"
        value={suche}
        onChange={(e) => setSuche(e.target.value)}
        className="mt-3"
      />
      <div className="mt-3 max-h-[45vh] overflow-auto -mx-1">
        {treffer.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onStart(p, kuerzelOf(p.clientName || p.title))}
            className="w-full text-left px-3 py-2.5 rounded hover:bg-[#f5f5f5]"
          >
            <p className="text-sm font-medium" style={{ color: RITTLER.black }}>{p.title}</p>
            {p.clientName && (
              <p className="text-xs" style={{ color: RITTLER.textSecondary }}>{p.clientName}</p>
            )}
          </button>
        ))}
        {treffer.length === 0 && (
          <p className="px-3 py-4 text-sm" style={{ color: RITTLER.textSecondary }}>Kein Projekt gefunden.</p>
        )}
      </div>
    </div>
  );
}