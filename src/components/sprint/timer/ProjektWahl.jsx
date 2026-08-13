import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Check } from 'lucide-react';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { kuerzelOf } from '@/lib/sprint/useTimer';

// Projektauswahl — kein Feld für Etappe, Ticket oder Aufgabe.
export default function ProjektWahl({ selected, onSelect }) {
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
    <div>
      <Input placeholder="Projekt suchen" value={suche} onChange={(e) => setSuche(e.target.value)} />
      <div className="mt-2 max-h-[34vh] overflow-auto">
        {treffer.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p, kuerzelOf(p.clientName || p.title))}
            className="w-full text-left px-2.5 py-2 rounded hover:bg-muted flex items-center gap-2"
          >
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium truncate" style={{ color: RITTLER.black }}>{p.title}</span>
              {p.clientName && (
                <span className="block text-xs truncate" style={{ color: RITTLER.textSecondary }}>{p.clientName}</span>
              )}
            </span>
            {selected?.id === p.id && <Check className="w-4 h-4 shrink-0" style={{ color: RITTLER.pink }} />}
          </button>
        ))}
        {treffer.length === 0 && (
          <p className="px-2.5 py-4 text-sm" style={{ color: RITTLER.textSecondary }}>Kein Projekt gefunden.</p>
        )}
      </div>
    </div>
  );
}