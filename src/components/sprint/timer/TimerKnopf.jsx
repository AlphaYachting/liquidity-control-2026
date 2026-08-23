import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { useTimer } from '@/lib/sprint/useTimer';
import { useOffeneTage } from '@/lib/zeit/useOffeneTage';
import { RITTLER } from '@/components/sprint/sprintConfig';
import TimerKarte from './TimerKarte';
import Erfassungszeile from '@/components/zeit/Erfassungszeile';
import ErfassungsFenster from '@/components/zeit/ErfassungsFenster';
import SchnellProjekte from '@/components/zeit/SchnellProjekte';

// Knopf im Sprint-Modul und bei laufendem Timer — die Zeile selbst ist überall mit T erreichbar.
export default function TimerKnopf() {
  const { pathname } = useLocation();
  const imSprintModul = pathname === '/sprint' || pathname.startsWith('/sprint/');
  const { user } = useAuth();
  const email = user?.email;
  const { timer, running, label, start, stop } = useTimer(email);
  const { aeltester } = useOffeneTage(email);
  const navigate = useNavigate();
  const [offen, setOffen] = useState(false);
  const [tippzeile, setTippzeile] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  // Taste T öffnet die Erfassungszeile von jeder Seite aus.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 't' && e.key !== 'T') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target;
      if (el?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName)) return;
      e.preventDefault();
      setOffen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!email) return null;

  const starten = async (project, kuerzel, notiz, opts) => {
    const res = await start(project, kuerzel, notiz, opts);
    if (res?.started) setOffen(false);
    return res;
  };

  const stoppen = async (note, abzugMinuten) => {
    // Gemessene Zeit geht nie verloren: bei offenem Tag läuft der Timer weiter statt zu buchen.
    if (aeltester) {
      setOffen(false);
      navigate('/zeiten');
      toast({
        description: `${aeltester.tag.slice(8, 10)}.${aeltester.tag.slice(5, 7)}. ist noch offen — der Timer läuft weiter, gebucht wird, sobald der Tag abgeschlossen ist.`,
      });
      return;
    }
    const res = await stop(note, abzugMinuten);
    setOffen(false);
    qc.invalidateQueries({ queryKey: ['sprintHeute'] });
    qc.invalidateQueries({ queryKey: ['projektKontext'] });
    qc.invalidateQueries({ queryKey: ['offeneTage'] });
    if (res) toast({ description: `${res.hours} h auf ${res.projekt || 'Projekt'} gebucht.` });
  };

  const gebucht = (stunden, titel) => {
    setOffen(false);
    qc.invalidateQueries({ queryKey: ['sprintHeute'] });
    qc.invalidateQueries({ queryKey: ['projektKontext'] });
    qc.invalidateQueries({ queryKey: ['zeitProjektSuche'] });
    qc.invalidateQueries({ queryKey: ['offeneTage'] });
    toast({ description: `${stunden} h auf ${titel} gebucht.` });
  };

  return (
    <>
      {(imSprintModul || running) && (
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
      )}

      {offen && (
        <ErfassungsFenster onClose={() => { setOffen(false); setTippzeile(false); }}>
          {running ? (
            <TimerKarte timer={timer} label={label} schmal={!imSprintModul} onStop={stoppen} />
          ) : tippzeile ? (
            <Erfassungszeile email={email} onStart={starten} onBooked={gebucht} />
          ) : (
            <div className="p-5">
              <SchnellProjekte email={email} onStart={starten} onTippzeile={() => setTippzeile(true)} />
            </div>
          )}
        </ErfassungsFenster>
      )}
    </>
  );
}