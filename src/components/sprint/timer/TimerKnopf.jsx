import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { useTimer } from '@/lib/sprint/useTimer';
import { RITTLER } from '@/components/sprint/sprintConfig';
import TimerKarte from './TimerKarte';
import TimerStart from './TimerStart';

// Im Ruhezustand nur unter /sprint — bei laufendem Timer auf jeder Seite.
export default function TimerKnopf() {
  const { pathname } = useLocation();
  const imSprintModul = pathname === '/sprint' || pathname.startsWith('/sprint/');
  const { user } = useAuth();
  const email = user?.email;
  const { timer, running, label, start, stop } = useTimer(email);
  const [offen, setOffen] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  if (!email) return null;
  if (!imSprintModul && !running) return null;

  const starten = async (project, kuerzel, notiz, opts) => {
    const res = await start(project, kuerzel, notiz, opts);
    if (res?.started) setOffen(false);
    return res;
  };

  const stoppen = async () => {
    const res = await stop();
    setOffen(false);
    qc.invalidateQueries({ queryKey: ['sprintHeute'] });
    qc.invalidateQueries({ queryKey: ['projektKontext'] });
    if (res) toast({ description: `${res.hours} h auf ${res.projekt || 'Projekt'} gebucht.` });
  };

  const gebucht = (stunden, titel) => {
    setOffen(false);
    qc.invalidateQueries({ queryKey: ['sprintHeute'] });
    qc.invalidateQueries({ queryKey: ['projektKontext'] });
    toast({ description: `${stunden} h auf ${titel} gebucht.` });
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
            className="absolute left-0 right-0 bottom-0 bg-white rounded-t-xl sm:left-auto sm:bottom-24 sm:right-6 sm:w-[340px] sm:rounded-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {running
              ? <TimerKarte timer={timer} label={label} schmal={!imSprintModul} onStop={stoppen} />
              : <TimerStart email={email} onStart={starten} onBooked={gebucht} />}
          </div>
        </div>
      )}
    </>
  );
}