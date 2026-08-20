import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, History } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// aWork-Historie: Original-Aufgabenliste und Gesamtstunden aus dem Snapshot
export default function AworkVerlaufPanel({ clientName, projectTitle }) {
  const [open, setOpen] = useState(false);

  const { data: snapshot, isLoading } = useQuery({
    enabled: open,
    queryKey: ['aworkSnapshot', clientName, projectTitle],
    queryFn: async () => {
      const all = await base44.entities.AworkProjectSnapshot.list('-last_synced_at', 300);
      const key = (s) => `${s || ''}`.toLowerCase();
      return (
        all.find((s) => key(s.company_name) === key(clientName)) ||
        all.find((s) => key(s.name).includes(key(projectTitle).split('—')[0].trim())) ||
        null
      );
    },
  });

  const payload = (() => {
    try { return snapshot?.raw_payload ? JSON.parse(snapshot.raw_payload) : null; } catch { return null; }
  })();
  const aufgaben = payload?.aufgaben || [];
  const stunden = payload?.stunden_gesamt ?? (snapshot?.tracked_duration_minutes || 0) / 60;

  return (
    <div className="border-t border-border pt-3">
      <button onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <History className="w-3.5 h-3.5" />
        aWork-Historie ansehen
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-3">
          {isLoading && <p className="text-xs text-muted-foreground">Wird geladen…</p>}
          {!isLoading && !snapshot && (
            <p className="text-xs text-muted-foreground">Für dieses Projekt liegt kein aWork-Verlauf vor.</p>
          )}
          {!isLoading && snapshot && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {snapshot.name} · {aufgaben.length || snapshot.tasks_count || 0} Aufgaben ·{' '}
                {stunden.toLocaleString('de-AT', { maximumFractionDigits: 1 })} h gebucht
                {payload?.listen?.length ? ` · Listen: ${payload.listen.join(', ')}` : ''}
              </p>
              <div className="max-h-72 overflow-y-auto rounded-md border border-border divide-y divide-border">
                {aufgaben.map((a, i) => (
                  <div key={i} className="flex items-baseline gap-2 px-3 py-1.5 text-xs">
                    <span className="flex-1 min-w-0">{a.title}</span>
                    {a.etappe && <span className="text-muted-foreground shrink-0">{a.etappe}</span>}
                    {a.liste && <span className="text-muted-foreground shrink-0">{a.liste}</span>}
                    <span className="shrink-0 font-medium text-muted-foreground">{a.original_status || '—'}</span>
                    {a.als_ticket === false && (
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                        kein Ticket
                      </span>
                    )}
                  </div>
                ))}
                {aufgaben.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Keine Aufgabenliste im Verlauf gespeichert.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}