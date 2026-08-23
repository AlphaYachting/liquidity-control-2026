import React, { useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { RITTLER, todayIso } from '@/components/sprint/sprintConfig';
import { bucheZeit, stundenAus } from '@/lib/sprint/useTimer';
import { parseEingabe } from '@/lib/zeit/eingabeParser';
import { findeLuecke, fensterZuIso } from '@/lib/zeit/luecke';
import { useProjektSuche } from '@/lib/zeit/useProjektSuche';
import TrefferListe from './TrefferListe';
import VorschauEtiketten from './VorschauEtiketten';
import SchnellProjektDialog from './SchnellProjektDialog';

// Eine Zeile statt Reiter, Suchfeld, Stundenfeld und Notizfeld.
export default function Erfassungszeile({ email, onStart, onBooked }) {
  const [text, setText] = useState('');
  const [gewaehlt, setGewaehlt] = useState(null);
  const [aktiv, setAktiv] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(false);
  const { suche, clients } = useProjektSuche(email);

  const { fenster, minuten, projektWort, notiz } = useMemo(() => parseEingabe(text), [text]);
  const treffer = useMemo(() => suche(projektWort), [suche, projektWort]);
  const projekt = gewaehlt || (projektWort ? treffer[0] : null);
  const bereit = !!projekt && minuten > 0;

  const uebernehmen = (p) => {
    setGewaehlt(p);
    setAktiv(0);
  };

  const buchen = async () => {
    if (!bereit) return;
    setBusy(true);
    const tag = todayIso();
    let zeiten;
    if (fenster) {
      zeiten = fensterZuIso(tag, fenster);
    } else {
      const heute = await base44.entities.TimeEntry.filter({ person_email: email, entry_date: tag }, '-started_at', 50);
      zeiten = findeLuecke(tag, heute, minuten);
    }
    await bucheZeit({
      projectId: projekt.id,
      email,
      durationMinutes: minuten,
      entryDate: tag,
      startedAt: zeiten.started_at,
      endedAt: zeiten.ended_at,
      note: notiz,
      quelle: fenster ? 'zeile' : 'luecke',
    });
    setBusy(false);
    setText('');
    setGewaehlt(null);
    onBooked?.(stundenAus(minuten), projekt.title);
  };

  const timerStarten = async () => {
    if (!projekt) return;
    setBusy(true);
    await onStart?.(projekt, projekt.kuerzelAnzeige, notiz, { force: true });
    setBusy(false);
  };

  const tasten = (e) => {
    const anzahl = treffer.length + (projektWort ? 1 : 0);
    if (e.key === 'ArrowDown') { e.preventDefault(); setAktiv((a) => (a + 1) % Math.max(anzahl, 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setAktiv((a) => (a - 1 + anzahl) % Math.max(anzahl, 1)); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (aktiv === treffer.length && projektWort) { setDialog(true); return; }
    if (treffer[aktiv] && treffer[aktiv].id !== projekt?.id) { uebernehmen(treffer[aktiv]); return; }
    buchen();
  };

  return (
    <div className="p-5">
      <p className="text-[11px] font-bold uppercase tracking-[2px]" style={{ color: RITTLER.textSecondary }}>
        Zeit erfassen
      </p>
      <Input
        autoFocus
        className="mt-2"
        placeholder="ami 2,5 Wireframes überarbeitet"
        value={text}
        onChange={(e) => { setText(e.target.value); setGewaehlt(null); }}
        onKeyDown={tasten}
      />

      <VorschauEtiketten projekt={projekt} fenster={fenster} minuten={minuten} notiz={notiz} />

      <TrefferListe
        treffer={treffer}
        aktiv={aktiv}
        wort={projektWort}
        onWaehlen={uebernehmen}
        onAnlegen={() => setDialog(true)}
      />

      <div className="flex gap-2 mt-3">
        <button
          type="button"
          disabled={busy || !bereit}
          onClick={buchen}
          className="flex-1 h-11 rounded text-white text-sm font-bold uppercase tracking-wide disabled:opacity-60"
          style={{ backgroundColor: RITTLER.pink }}
        >
          Buchen
        </button>
        <button
          type="button"
          disabled={busy || !projekt}
          onClick={timerStarten}
          title="Timer starten"
          className="h-11 px-4 rounded border-[1.5px] text-sm font-bold uppercase disabled:opacity-60 flex items-center gap-1.5"
          style={{ borderColor: RITTLER.black, color: RITTLER.black }}
        >
          <Play className="w-4 h-4" /> Timer
        </button>
      </div>

      <SchnellProjektDialog
        open={dialog}
        onOpenChange={setDialog}
        vorgabe={projektWort}
        email={email}
        clients={clients}
        onCreated={uebernehmen}
      />
    </div>
  );
}