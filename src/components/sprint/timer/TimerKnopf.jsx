import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { useTimer } from '@/lib/sprint/useTimer';
import { useOffeneTage } from '@/lib/zeit/useOffeneTage';
import { useZeitKontext } from '@/lib/sprint/ZeitKontext';
import { RITTLER } from '@/components/sprint/sprintConfig';
import TimerKarte from './TimerKarte';
import Erfassungszeile from '@/components/zeit/Erfassungszeile';
import ErfassungsFenster from '@/components/zeit/ErfassungsFenster';
import SchnellProjekte from '@/components/zeit/SchnellProjekte';
import VorauswahlStart from '@/components/zeit/VorauswahlStart';
import BuchungBestaetigung from '@/components/zeit/BuchungBestaetigung';
import NichtGebucht from '@/components/zeit/NichtGebucht';
import SperrHinweis from '@/components/zeit/SperrHinweis';

// Knopf im Sprint-Modul und bei laufendem Timer — die Zeile selbst ist überall mit T erreichbar.
export default function TimerKnopf() {
  const { pathname } = useLocation();
  const imSprintModul = pathname === '/sprint' || pathname.startsWith('/sprint/');
  const { user } = useAuth();
  const email = user?.email;
  const { timer, running, label, start, stop, ueberzogen, elapsedMinutes } = useTimer(email);
  const { aeltester } = useOffeneTage(email);
  const kontext = useZeitKontext();
  const navigate = useNavigate();
  const [offen, setOffen] = useState(false);
  const [tippzeile, setTippzeile] = useState(false);
  const [bestaetigung, setBestaetigung] = useState(null);
  const [nichtGebucht, setNichtGebucht] = useState(null);
  const [letzterStopp, setLetzterStopp] = useState({ note: '', abzugMinuten: 0 });
  const [sperre, setSperre] = useState(false);
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

  const schliessen = () => {
    setOffen(false);
    setTippzeile(false);
    setBestaetigung(null);
    setNichtGebucht(null);
    setSperre(false);
  };

  const auffrischen = () => {
    qc.invalidateQueries({ queryKey: ['sprintHeute'] });
    qc.invalidateQueries({ queryKey: ['projektKontext'] });
    qc.invalidateQueries({ queryKey: ['zeitProjektSuche'] });
    qc.invalidateQueries({ queryKey: ['ticketHours'] });
    qc.invalidateQueries({ queryKey: ['offeneTage'] });
  };

  const zumAbschluss = (zielTag) => {
    schliessen();
    navigate(`/zeiten?tag=${zielTag}&abschluss=1`);
  };

  // Gesperrt wird, was noch nicht begonnen hat: ein NEUER Timer wartet auf den
  // offenen Tag — ein laufender lässt sich immer beenden.
  const starten = async (project, kuerzel, notiz, opts) => {
    if (aeltester && !running) {
      setSperre(true);
      return { gesperrt: true };
    }
    const res = await start(project, kuerzel, notiz, opts);
    if (res?.started) setOffen(false);
    return res;
  };

  const stoppen = async (note, abzugMinuten) => {
    // Keine Prüfung auf einen offenen Tag: die entstehende Buchung gehört zum
    // HEUTIGEN Tag, nicht zum offenen Vortag. Die alte Sperre hat nie das
    // geschützt, was sie zu schützen vorgab — sie hat nur verhindert, dass eine
    // bereits gemessene Zeit festgehalten wird.
    const res = await stop(note, abzugMinuten);
    // Gescheitert: der Timer läuft weiter, das Fenster sagt es ausdrücklich.
    if (res?.fehler) {
      setLetzterStopp({ note, abzugMinuten });
      setNichtGebucht(res);
      return;
    }
    auffrischen();
    // Die Bestätigung bleibt im Fenster stehen — sie verdeckt die Pille nicht.
    if (res) {
      setBestaetigung({
        eintragId: res.eintragId,
        projectId: res.projectId,
        minuten: res.minuten,
        projekt: res.projekt,
        datum: res.datum,
        offenerTag: aeltester?.tag || null,
      });
    } else {
      setOffen(false);
    }
  };

  const gebucht = (stunden, titel, info) => {
    auffrischen();
    if (info?.eintragId) {
      setTippzeile(false);
      setBestaetigung({ ...info, projekt: titel });
      return;
    }
    setOffen(false);
    toast({ description: `${stunden} h auf ${titel} gebucht.` });
  };

  const hatKontext = !!kontext.project_id && kontext.quelle !== 'keiner';

  // Der Fenstertitel benennt den Zustand — eine Kopfzeile für alle.
  const titel = sperre ? 'Timer läuft bereits'
    : bestaetigung ? 'Gebucht'
    : nichtGebucht ? 'Nicht gebucht'
    : tippzeile ? 'Zeit nachtragen'
    : running ? 'Läuft'
    : 'Zeit erfassen';

  return (
    <>
      {(imSprintModul || running || hatKontext) && (
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
        <ErfassungsFenster onClose={schliessen} titel={titel}>
          {sperre ? (
            <SperrHinweis aeltester={aeltester} onAbschluss={zumAbschluss} onZurueck={() => setSperre(false)} />
          ) : bestaetigung ? (
            <BuchungBestaetigung
              info={bestaetigung}
              onFertig={() => (bestaetigung.offenerTag ? zumAbschluss(bestaetigung.offenerTag) : schliessen())}
              onRueckgaengig={auffrischen}
            />
          ) : nichtGebucht ? (
            <NichtGebucht
              info={nichtGebucht}
              onNochmal={async () => {
                setNichtGebucht(null);
                await stoppen(letzterStopp.note, letzterStopp.abzugMinuten);
              }}
              onWeiterlaufen={schliessen}
            />
          ) : tippzeile ? (
            <Erfassungszeile
              email={email}
              onStart={starten}
              onBooked={gebucht}
              onZurueck={running ? () => setTippzeile(false) : undefined}
            />
          ) : running ? (
            <TimerKarte
              timer={timer}
              label={label}
              onStop={stoppen}
              onWechseln={() => setTippzeile(true)}
              ueberzogen={ueberzogen}
              elapsedMinutes={elapsedMinutes}
            />
          ) : hatKontext ? (
            <VorauswahlStart
              kontext={kontext}
              onStart={starten}
              onSuche={() => setTippzeile(true)}
              onNachtragen={() => setTippzeile(true)}
            />
          ) : (
            <div className="px-4 pt-[14px] pb-4">
              <SchnellProjekte email={email} onStart={starten} onTippzeile={() => setTippzeile(true)} />
            </div>
          )}
        </ErfassungsFenster>
      )}
    </>
  );
}