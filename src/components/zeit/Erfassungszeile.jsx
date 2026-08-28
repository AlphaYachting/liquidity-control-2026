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
import FeldGruppe from './FeldGruppe';
import SchnellProjektDialog from './SchnellProjektDialog';

// Eine Zeile statt Reiter, Suchfeld, Stundenfeld und Notizfeld.
const gestern = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function Erfassungszeile({ email, onStart, onBooked, tag: tagProp, vorbelegung, pruefen, onZurueck }) {
  // Nachtragen heißt: erst der Tag, dann alles andere. Vorbelegt ist gestern.
  const [datum, setDatum] = useState(gestern());
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
    const tag = tagProp || datum || todayIso();
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
      {!tagProp && (
        <FeldGruppe label="Für welchen Tag">
          <Input type="date" value={datum} max={todayIso()} onChange={(e) => setDatum(e.target.value)} />
        </FeldGruppe>
      )}

      <FeldGruppe label="Was und wie lange" className={tagProp ? '' : 'mt-[11px]'}>
        <Input
          autoFocus
          placeholder="hw 2,5 Wireframes überarbeitet"
          value={text}
          onChange={(e) => { setText(e.target.value); setGewaehlt(null); setListeOffen(true); }}
          onKeyDown={tasten}
        />
      </FeldGruppe>

      <VorschauSatz projekt={projekt} minuten={minuten} notiz={notiz} eingabe={projektWort} />

      {listeOffen && (
        <TrefferListe
          treffer={treffer}
          wort={projektWort}
          onWaehlen={uebernehmen}
          onAnlegen={() => setDialog(true)}
        />
      )}

      {projekt && <div className="mt-2"><TaetigkeitWahl wert={taetigkeit} onWaehlen={setTaetigkeit} /></div>}

      <HauptKnopf
        disabled={busy || !bereit}
        grund={!projekt ? 'Es fehlt noch das Projekt.' : 'Es fehlt noch die Dauer.'}
        onClick={buchen}
      >
        Buchen
      </HauptKnopf>

      <FussVerweise
        links={onZurueck ? { text: '← zurück zum Timer', onClick: onZurueck } : null}
        rechts={onStart && projekt ? { text: 'stattdessen Timer starten', onClick: timerStarten } : null}
      />

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