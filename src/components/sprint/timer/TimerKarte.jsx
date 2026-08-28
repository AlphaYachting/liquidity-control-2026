import React, { useState } from 'react';
import { Square } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useProjektKontext } from '@/lib/sprint/useProjektKontext';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { dauerText, uhr } from '@/lib/zeit/tagesAuswertung';
import ProjektKopf from '@/components/zeit/ProjektKopf';
import ZahlenBlock from '@/components/zeit/ZahlenBlock';
import HauptKnopf from '@/components/zeit/HauptKnopf';
import FussVerweise from '@/components/zeit/FussVerweise';

const jetztMinute = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

// Laufender Timer: dieselbe Ordnung wie im Ruhezustand, nur mit Uhr.
export default function TimerKarte({ timer, label, onStop, onWechseln, ueberzogen, elapsedMinutes = 0 }) {
  const [busy, setBusy] = useState(false);
  const [notiz, setNotiz] = useState('');
  const [korrektur, setKorrektur] = useState('');
  const [pausen, setPausen] = useState([]);
  const [pauseAb, setPauseAb] = useState(null);
  const { data: kontext } = useProjektKontext(timer.project_id);

  const pausenMinuten = pausen.reduce((s, p) => s + (p.bis - p.von), 0);

  const pauseUmschalten = () => {
    if (pauseAb === null) setPauseAb(jetztMinute());
    else {
      setPausen((l) => [...l, { von: pauseAb, bis: Math.max(pauseAb, jetztMinute()) }]);
      setPauseAb(null);
    }
  };

  const stoppen = async () => {
    setBusy(true);
    let abzug = pausenMinuten + (pauseAb === null ? 0 : Math.max(0, jetztMinute() - pauseAb));
    // Korrigierte Dauer schlägt die gemessene — der Rest wird als Abzug verbucht.
    const gewuenscht = Number(String(korrektur).replace(',', '.'));
    if (korrektur && gewuenscht > 0) {
      abzug = Math.max(0, Math.round(elapsedMinutes - gewuenscht * 60));
    }
    await onStop(notiz, abzug);
    setBusy(false);
  };

  return (
    <div className="px-4 pt-[14px] pb-4">
      <ProjektKopf
        kunde={kontext?.client?.name}
        titel={kontext?.project?.title || timer.projekt_titel}
        kategorie={kontext?.kategorie}
      />

      <p className="text-[40px] font-bold leading-none mt-3 tabular-nums" style={{ color: RITTLER.black }}>
        {label}
      </p>

      <ZahlenBlock kontext={kontext} />

      {(pausen.length > 0 || pauseAb !== null) && (
        <p className="text-[11.5px] mt-2" style={{ color: STATUS_COLORS.attention }}>
          {pauseAb !== null ? `Pause läuft seit ${uhr(pauseAb)}` : `Pause ${dauerText(pausenMinuten)} — wird abgezogen`}
        </p>
      )}

      {ueberzogen && (
        <div
          className="mt-3 p-3 rounded"
          style={{ backgroundColor: STATUS_COLORS.attentionSurface, color: STATUS_COLORS.attention }}
        >
          <p className="text-[13px] font-bold">Über zehn Stunden gelaufen</p>
          <p className="text-[12.5px] mt-0.5">
            Vermutlich wurde vergessen zu stoppen. Gebucht wird erst, wenn du bestätigst — korrigiere die Dauer, wenn sie nicht stimmt.
          </p>
          <Input
            className="mt-2 bg-white"
            placeholder="Tatsächliche Dauer in Stunden, z. B. 3,5"
            value={korrektur}
            onChange={(e) => setKorrektur(e.target.value)}
          />
        </div>
      )}

      <Input
        className="mt-3"
        placeholder="Notiz zur Buchung"
        value={notiz}
        onChange={(e) => setNotiz(e.target.value)}
      />

      <HauptKnopf disabled={busy} onClick={stoppen} icon={<Square className="w-4 h-4" />}>
        Stoppen und buchen
      </HauptKnopf>

      <FussVerweise
        links={onWechseln ? { text: 'Projekt wechseln', onClick: onWechseln } : null}
        rechts={{ text: pauseAb === null ? 'Pause einlegen' : 'Pause beenden', onClick: pauseUmschalten }}
      />
    </div>
  );
}