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
import BereichChips from '@/components/zeit/BereichChips';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { istSupportOhneTicket } from '@/lib/zeit/supportBeschreibung';
import { Textarea } from '@/components/ui/textarea';
import MehraufwandSchalter from '@/components/zeit/MehraufwandSchalter';

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
  // Audit 24.10.2026: Mehraufwand und Meeting-Ergebnis werden beim Stoppen erfasst — ohne Zusatzweg
  const [mehraufwand, setMehraufwand] = useState(false);
  const [meeting, setMeeting] = useState(false);
  const [vereinbart, setVereinbart] = useState('');
  const { data: kontext } = useProjektKontext(timer.project_id);
  const kategorie = kontext?.kategorie || '';
  // Nur bei Festpreis-Arbeit (Sprint, Paket) ist die Frage „im Auftrag oder Zusatzwunsch?“ sinnvoll
  const frageMehraufwand = ['sprint', 'paket'].includes(kategorie);
  const kundenProjekt = !!kategorie && kategorie !== 'intern';
  const qc = useQueryClient();

  const pausenMinuten = pausen.reduce((s, p) => s + (p.bis - p.von), 0);
  // Support ohne Ticket: Beschreibung ist Pflicht (21.10.2026) — eine Notiz vom Start zählt mit
  const notizPflicht = istSupportOhneTicket(kontext?.project, timer.ticket_id) && !String(timer.notiz || '').trim();
  const notizFehlt = notizPflicht && !notiz.trim();

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
    await onStop(notiz, abzug, {
      ...(frageMehraufwand ? { mehrleistung: mehraufwand } : {}),
      ...(meeting ? { taetigkeit: 'meeting' } : {}),
      ...(meeting && kundenProjekt && vereinbart.trim() ? { vereinbart: vereinbart.trim() } : {}),
    });
    setBusy(false);
  };

  return (
    <div className="px-4 pt-[14px] pb-4">
      <ProjektKopf
        kunde={kontext?.client?.name}
        titel={kontext?.project?.title || timer.projekt_titel}
        kategorie={kontext?.kategorieText || kontext?.kategorie}
      />

      <p className="text-[40px] font-bold leading-none mt-3 tabular-nums" style={{ color: RITTLER.black }}>
        {label}
      </p>

      <ZahlenBlock kontext={kontext} />

      <BereichChips
        projectId={timer.project_id}
        wert={timer.module_template_id || null}
        onWaehlen={async (id) => {
          await base44.entities.LaufendeZeitbuchung.update(timer.id, { module_template_id: id });
          qc.invalidateQueries({ queryKey: ['laufendeZeitbuchung', timer.person_email] });
        }}
      />

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
        autoFocus
        className="mt-3"
        placeholder={notizPflicht ? 'Was wurde gemacht? (Pflicht bei Support ohne Ticket)' : 'Notiz zur Buchung'}
        value={notiz}
        onChange={(e) => setNotiz(e.target.value)}
      />

      <div className="flex flex-wrap gap-1.5 mt-2">
        {frageMehraufwand && (
          <MehraufwandSchalter wert={mehraufwand} onWechsel={setMehraufwand} />
        )}
        <button
          type="button"
          onClick={() => setMeeting((m) => !m)}
          aria-pressed={meeting}
          title="Die Zeit war ein Meeting oder Kundentermin"
          className="text-[11.5px] px-2 py-0.5 rounded border transition-colors"
          style={{
            borderColor: meeting ? RITTLER.pink : RITTLER.line,
            backgroundColor: meeting ? 'hsl(var(--primary) / 0.08)' : 'transparent',
            color: meeting ? RITTLER.pink : RITTLER.textSecondary,
            fontWeight: meeting ? 600 : 400,
          }}
        >
          {meeting ? '✓ Meeting' : '+ Meeting'}
        </button>
      </div>
      {meeting && kundenProjekt && (
        <Textarea
          className="mt-2 text-[13px]"
          rows={3}
          placeholder="Was wurde vereinbart? Kommt in den Projektakt (optional)"
          value={vereinbart}
          onChange={(e) => setVereinbart(e.target.value)}
        />
      )}

      <HauptKnopf
        disabled={busy || notizFehlt}
        grund={notizFehlt ? 'Support ohne Ticket: Bitte kurz beschreiben, was gemacht wurde.' : undefined}
        onClick={stoppen}
        icon={<Square className="w-4 h-4" />}
      >
        Stoppen und buchen
      </HauptKnopf>

      <FussVerweise
        links={onWechseln ? { text: 'Projekt wechseln', onClick: onWechseln } : null}
        rechts={{ text: pauseAb === null ? 'Pause einlegen' : 'Pause beenden', onClick: pauseUmschalten }}
      />
    </div>
  );
}