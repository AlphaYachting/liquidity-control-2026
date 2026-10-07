import React, { useState } from 'react';
import { Lock, CheckCircle2, Unlock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { uhr, dauerText } from '@/lib/zeit/tagesAuswertung';
import { aendereZeit } from '@/lib/sprint/useTimer';
import { beschreibungReicht } from '@/lib/zeit/beschreibungPflicht';

// Eine Buchung ohne Ticket und ohne Beschreibung — hier direkt beschreiben
function BeschreibungNachtragen({ eintrag, label, onSaved }) {
  const [text, setText] = useState(eintrag.note || '');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');
  const ok = beschreibungReicht(text);
  const speichern = async () => {
    setBusy(true);
    setFehler('');
    try {
      await aendereZeit(eintrag.id, { note: text.trim() });
      onSaved?.();
    } catch (e) {
      setFehler(e?.message || 'Speichern fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };
  const von = eintrag.started_at ? new Date(eintrag.started_at) : null;
  const bis = eintrag.ended_at ? new Date(eintrag.ended_at) : null;
  const zeit = von && bis ? `${uhr(von.getHours() * 60 + von.getMinutes())}–${uhr(bis.getHours() * 60 + bis.getMinutes())}` : 'ohne Zeitfenster';
  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <div className="w-full sm:w-[260px] shrink-0 min-w-0">
        <p className="text-xs font-semibold truncate" style={{ color: RITTLER.black }}>{label}</p>
        <p className="text-xs" style={{ color: RITTLER.textSecondary }}>{zeit} · {dauerText(Number(eintrag.duration_minutes) || 0)}</p>
      </div>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && ok && !busy) speichern(); }}
        placeholder="Was wurde gemacht? z. B. Kontaktformular repariert und getestet"
        className="flex-1 min-w-[200px] h-9 px-3 rounded border text-sm"
        style={{ borderColor: ok ? RITTLER.line : STATUS_COLORS.attention }}
      />
      <button
        type="button"
        disabled={busy || !ok}
        onClick={speichern}
        className="h-9 px-4 rounded border text-xs font-bold uppercase tracking-wide disabled:opacity-40"
        style={{ borderColor: RITTLER.black, color: RITTLER.black }}
      >
        {busy ? 'Speichert…' : 'Speichern'}
      </button>
      {!ok && text.trim() && (
        <p className="w-full text-xs" style={{ color: STATUS_COLORS.attention }}>
          Noch zu knapp: bitte mindestens zwei Wörter, was gemacht wurde — z. B. „Projektmanagement Abstimmung mit Kunde“. Dann wird „Speichern“ aktiv.
        </p>
      )}
      {fehler && <p className="w-full text-xs" style={{ color: STATUS_COLORS.attention }}>{fehler}</p>}
    </div>
  );
}

const GRUND_TEXT = {
  frei: 'Als nicht anwesend abgeschlossen — Urlaub, Krankheit, Feiertag oder nicht da.',
  abwesend: 'Abwesend geplant — der Tag zählt nicht als offen.',
  erfasst: 'Tag abgeschlossen — Änderungen entstehen als Korrekturbuchung.',
};

// Abschlussleiste: abschließen oder als nicht anwesend abschließen. Nie automatisch buchen.
// Lücken sperren den Abschluss nicht — nicht gebuchte Zeit bleibt als Lücke sichtbar.
export default function TagAbschliessen({
  auswertung, abschluss, email, tag, onSaved, wocheBestaetigt, darfFremdOeffnen,
  ohneBeschreibung = [], projektLabel,
}) {
  const [busy, setBusy] = useState(false);
  const bestaetigt = !!abschluss?.bestaetigt_am;

  const offeneLoecher = auswertung.loecher;
  const offenSumme = offeneLoecher.reduce((s, l) => s + l.minuten, 0);
  const fehlendeBeschreibung = ohneBeschreibung.length > 0;
  const bereit = auswertung.anzahl > 0 && !fehlendeBeschreibung;

  const speichern = async (daten) => {
    setBusy(true);
    if (abschluss) await base44.entities.Tagesabschluss.update(abschluss.id, daten);
    else await base44.entities.Tagesabschluss.create({ person_email: email, tag, tagesnorm_minuten: 480, ...daten });
    setBusy(false);
    onSaved?.();
  };

  const abschliessen = (grund) => speichern({
    grund,
    bestaetigt_am: new Date().toISOString(),
    bestaetigt_von: email,
  });

  const wiederOeffnen = async () => {
    setBusy(true);
    await base44.entities.Tagesabschluss.update(abschluss.id, {
      bestaetigt_am: null,
      bestaetigt_von: '',
    });
    if (abschluss.person_email !== email) {
      await base44.entities.AuditLog.create({
        action: 'update',
        entity_type: 'Tagesabschluss',
        entity_id: abschluss.id,
        user_email: email,
        details: `Tag ${tag} von ${abschluss.person_email} wieder geöffnet`,
      });
    }
    setBusy(false);
    onSaved?.();
  };

  if (bestaetigt) {
    const darfOeffnen = darfFremdOeffnen || !wocheBestaetigt;
    return (
      <div className="flex items-center justify-between gap-4 px-3 py-3 bg-white rounded border" style={{ borderColor: RITTLER.line }}>
        <p className="flex items-center gap-2 text-sm" style={{ color: RITTLER.textSecondary }}>
          <CheckCircle2 className="w-4 h-4" style={{ color: STATUS_COLORS.done }} />
          {GRUND_TEXT[abschluss.grund || 'erfasst']}
        </p>
        {darfOeffnen && (
          <button
            type="button"
            disabled={busy}
            onClick={wiederOeffnen}
            className="h-9 px-4 rounded border text-xs font-bold uppercase tracking-wide shrink-0 flex items-center gap-2 disabled:opacity-40"
            style={{ borderColor: RITTLER.black, color: RITTLER.black }}
          >
            <Unlock className="w-3.5 h-3.5" /> Wieder öffnen
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
    {fehlendeBeschreibung && (
      <div className="px-3 py-3 bg-white rounded" style={{ border: `1.5px solid ${STATUS_COLORS.attention}` }}>
        <p className="text-sm font-bold" style={{ color: STATUS_COLORS.attention }}>
          {ohneBeschreibung.length === 1 ? '1 Buchung braucht' : `${ohneBeschreibung.length} Buchungen brauchen`} noch eine Beschreibung, was gemacht wurde
        </p>
        <p className="text-xs mt-0.5" style={{ color: RITTLER.textSecondary }}>
          Diese Zeit wird nach Aufwand verrechnet und steht auf der Rechnung. Ohne Ticket braucht sie einen kurzen Satz (mindestens zwei Wörter) — vorher lässt sich der Tag nicht abschließen.
        </p>
        <div className="divide-y mt-1" style={{ borderColor: RITTLER.line }}>
          {ohneBeschreibung.map((e) => (
            <BeschreibungNachtragen key={e.id} eintrag={e} label={projektLabel ? projektLabel(e).voll : ''} onSaved={onSaved} />
          ))}
        </div>
      </div>
    )}
    <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 bg-white rounded border" style={{ borderColor: RITTLER.line }}>
      <p className="text-sm flex-1 min-w-[240px]" style={{ color: fehlendeBeschreibung ? STATUS_COLORS.attention : RITTLER.textSecondary }}>
        {auswertung.anzahl === 0
          ? 'Für diesen Tag liegt keine Buchung vor — erfassen oder als nicht anwesend abschließen.'
          : fehlendeBeschreibung
            ? 'Erst die fehlenden Beschreibungen eintragen, dann den Tag abschließen.'
            : offeneLoecher.length
              ? `${dauerText(offenSumme)} nicht gebucht (${offeneLoecher.map((l) => `${uhr(l.von)}–${uhr(l.bis)}`).join(', ')}) — bleibt als Lücke stehen. Der Tag kann abgeschlossen werden.`
              : 'Keine offene Lücke — der Tag kann abgeschlossen werden.'}
      </p>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          disabled={busy}
          onClick={() => abschliessen('frei')}
          title="Urlaub, Krankheit, Feiertag oder nicht da"
          className="h-9 px-4 rounded border text-xs font-bold uppercase tracking-wide disabled:opacity-40"
          style={{ borderColor: RITTLER.line, color: RITTLER.textSecondary }}
        >
          Nicht anwesend
        </button>
        <button
          type="button"
          disabled={busy || !bereit}
          onClick={() => abschliessen('erfasst')}
          className="h-9 px-4 rounded text-white text-xs font-bold uppercase tracking-wide flex items-center gap-2 disabled:opacity-40"
          style={{ backgroundColor: RITTLER.pink }}
        >
          <Lock className="w-3.5 h-3.5" /> Tag abschließen
        </button>
      </div>
    </div>
    </div>
  );
}