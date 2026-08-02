import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Clock } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useTimer } from '@/lib/sprint/useTimer';
import { RITTLER } from '@/components/sprint/sprintConfig';
import TimerKarte from './TimerKarte';
import TimerStart from './TimerStart';

// Sichtbar nur im Sprint-Modul — bei laufendem Timer überall.
export default function TimerKnopf() {
  const { pathname } = useLocation();
  const imSprintModul = pathname === '/sprint' || pathname.startsWith('/sprint/');
  const { timer, running, label, start, stop } = useTimer();
  const [offen, setOffen] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });

  if (!imSprintModul && !running) return null;

  const starten = (project, kuerzel) => {
    start(project, kuerzel);
    setOffen(false);
  };

  const stoppen = async (email) => {
    const hours = await stop(email || user?.email);
    setOffen(false);
    qc.invalidateQueries();
    toast({ description: `${hours} h auf ${timer.project_title} gebucht.` });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOffen(true)}
        aria-label={running ? 'Laufenden Timer öffnen' : 'Zeit erfassen'}
        className={
          running
            ? 'fixed bottom-6 right-6 z-40 h-14 px-5 rounded-full flex items-center gap-3 shadow-lg'
            : 'fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center shadow-lg'
        }
        style={{ backgroundColor: RITTLER.pink }}
      >
        {running ? (
          <>
            <span className="text-white text-[17px] font-bold tabular-nums">{label}</span>
            {timer.kuerzel && (
              <span className="text-white/90 text-[13px] font-bold tracking-wide">{timer.kuerzel}</span>
            )}
          </>
        ) : (
          <Clock className="w-6 h-6 text-white" />
        )}
      </button>

      {offen && (
        <div className="fixed inset-0 z-50" onClick={() => setOffen(false)}>
          <div className="absolute inset-0 bg-black/25" />
          <div
            className="absolute left-0 right-0 bottom-0 bg-white rounded-t-xl sm:left-auto sm:bottom-24 sm:right-6 sm:w-[320px] sm:rounded-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {running
              ? <TimerKarte timer={timer} label={label} userEmail={user?.email} onStop={stoppen} />
              : <TimerStart onStart={starten} />}
          </div>
        </div>
      )}
    </>
  );
}