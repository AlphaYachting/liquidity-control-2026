import React, { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { todayIso } from '@/components/sprint/sprintConfig';
import { bucheZeit, stundenAus } from '@/lib/sprint/useTimer';
import { parseEingabe } from '@/lib/zeit/eingabeParser';
import { findeLuecke, fensterZuIso } from '@/lib/zeit/luecke';
import { useProjektSuche } from '@/lib/zeit/useProjektSuche';
import { merkeTaetigkeit } from '@/lib/zeit/taetigkeit';
import TaetigkeitWahl from './TaetigkeitWahl';
import HauptKnopf from './HauptKnopf';
import FussVerweise from './FussVerweise';
import TrefferListe from './TrefferListe';
import VorschauSatz from './VorschauSatz';
import SchreibweiseHilfe from './SchreibweiseHilfe';
import SchnellProjektDialog from './SchnellProjektDialog';

// Eine Zeile statt Reiter, Suchfeld, Stundenfeld und Notizfeld.
export default function Erfassungszeile({ email, onStart, onBooked, tag: tagProp, vorbelegung, pruefen }) {
  const [text, setText] = useState('');
  const [gewaehlt, setGewaehlt] = useState(null);
  const [aktiv, setAktiv] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(false);
  // Vorbelegt ist immer Umsetzung — Beratung und Vertrieb werden bewusst gewählt.
  const [taetigkeit, setTaetigkeit] = useState('umsetzung');
  const [listeOffen, setListeOffen] = useState(true);
  const { suche, clients } = useProjektSuche(email);

  // Ein Klick auf ein Loch im Tagesstreifen setzt dessen Zeitfenster hierher.
  useEffect(() => {
    if (vorbelegung?.wert) setText((t) => `${vorbelegung.wert} ${t}`.trim());
  }, [vorbelegung]);

  const { fenster, minuten, projektWort, notiz } = useMemo(() => parseEingabe(text), [text]);
  const treffer = useMemo(() => suche(projektWort), [suche, projektWort]);
  const projekt = gewaehlt || (projektWort ? treffer[0] : null);
  const bereit = !!projekt && minuten > 0;

  const uebernehmen = (p) => {
    setGewaehlt(p);
    setAktiv(0);
    setListeOffen(false);
  };

  const buchen = async () => {
    if (!bereit) return;
    const tag = tagProp || todayIso();
    if (pruefen && !pruefen(tag)) return;
    setBusy(true);
    let zeiten;
    if (fenster) {
      zeiten = fensterZuIso(tag, fenster);
    } else {
      const heute = await base44.entities.TimeEntry.filter({ person_email: email, entry_date: tag }, '-started_at', 50);
      zeiten = findeLuecke(tag, heute, minuten);
    }
    const eintrag = await bucheZeit({
      projectId: projekt.id,
      email,
      durationMinutes: minuten,
      entryDate: tag,
      startedAt: zeiten.started_at,
      endedAt: zeiten.ended_at,
      note: notiz,
      taetigkeit: taetigkeit || undefined,
      quelle: fenster ? 'zeile' : 'luecke',
    });
    merkeTaetigkeit(taetigkeit);
    setBusy(false);
    setText('');
    setGewaehlt(null);
    onBooked?.(stundenAus(minuten), projekt.title, {
      eintragId: eintrag?.id,
      projectId: projekt.id,
      minuten,
      datum: tag,
    });
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
    <div className="px-4 pt-[14px] pb-4">
      <Input
        autoFocus
        placeholder="ami 2,5 Wireframes überarbeitet"
        value={text}
        onChange={(e) => { setText(e.target.value); setGewaehlt(null); setListeOffen(true); }}
        onKeyDown={tasten}
      />

      <VorschauSatz projekt={projekt} fenster={fenster} minuten={minuten} notiz={notiz} taetigkeit={taetigkeit} />

      <SchreibweiseHilfe />

      <TaetigkeitWahl wert={taetigkeit} onWaehlen={setTaetigkeit} />

      {listeOffen && (
        <TrefferListe
          treffer={treffer}
          aktiv={aktiv}
          wort={projektWort}
          onWaehlen={uebernehmen}
          onAnlegen={() => setDialog(true)}
        />
      )}

      <HauptKnopf
        disabled={busy || !bereit}
        grund={!projekt ? 'Es fehlt noch das Projekt.' : 'Es fehlt noch die Dauer.'}
        onClick={buchen}
      >
        Buchen
      </HauptKnopf>

      {onStart && (
        <FussVerweise rechts={projekt ? { text: 'stattdessen Timer starten', onClick: timerStarten } : null} />
      )}

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