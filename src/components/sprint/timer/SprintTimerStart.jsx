import React, { useState } from 'react';
import { Play, Square } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { useTimer } from '@/lib/sprint/useTimer';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { useOffenesTicket } from '@/lib/sprint/offenesTicket';

// Timer direkt aus dem Sprintkontext — läuft auf das Projekt, bei offener Aufgabe auf deren Ticket.
export default function SprintTimerStart({ project, client }) {
  const ticketId = useOffenesTicket();
  const { user } = useAuth();
  const { timer, running, label, start, stop } = useTimer(user?.email);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  if (!user?.email || !project?.id) return null;

  const laeuftHier = running && timer?.project_id === project.id;

  const klick = async () => {
    setBusy(true);
    if (laeuftHier) {
      const res = await stop();
      if (res) toast({ description: `${res.hours} h auf ${res.projekt || project.title} gebucht.` });
    } else {
      await start(project, (client?.name || project.title).slice(0, 3).toUpperCase(), '', { force: true, ticketId });
      toast({ description: 'Timer läuft.' });
    }
    qc.invalidateQueries({ queryKey: ['ticketHours'] });
    qc.invalidateQueries({ queryKey: ['sprintHeute'] });
    setBusy(false);
  };

  return (
    <button
      type="button"
      onClick={klick}
      disabled={busy}
      className="w-[160px] h-[56px] shrink-0 rounded flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wide disabled:opacity-60"
      style={
        laeuftHier
          ? { backgroundColor: RITTLER.pink, color: '#ffffff' }
          : { border: `1.5px solid ${RITTLER.black}`, color: RITTLER.black }
      }
    >
      {laeuftHier ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      {laeuftHier ? label : 'Timer starten'}
    </button>
  );
}