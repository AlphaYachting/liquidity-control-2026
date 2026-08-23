import React, { useState } from 'react';
import { Lock, CheckCircle2, Coffee, Unlock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { uhr, dauerText } from '@/lib/zeit/tagesAuswertung';
import { MAX_LUECKE } from '@/lib/zeit/offeneTage';

const GRUND_TEXT = {
  frei: 'Tag als frei abgeschlossen — Urlaub, Krankheit oder Feiertag.',
  abwesend: 'Abwesend geplant — der Tag zählt nicht als offen.',
  erfasst: 'Tag abgeschlossen — Änderungen entstehen als Korrekturbuchung.',
};

// Abschlussleiste: buchen, als Pause vermerken oder als frei abschließen. Nie automatisch buchen.
export default function TagAbschliessen({
  auswertung, abschluss, email, tag, onSaved, wocheBestaetigt, darfFremdOeffnen,
}) {
  const [busy, setBusy] = useState(false);
  const bestaetigt = !!abschluss?.bestaetigt_am;

  const zuGross = auswertung.loecher.filter((l) => l.minuten > MAX_LUECKE);
  const fehlt = zuGross.reduce((s, l) => s + l.minuten, 0);
  const offeneLoecher = auswertung.loecher;
  const offenSumme = offeneLoecher.reduce((s, l) => s + l.minuten, 0);
  const bereit = auswertung.anzahl > 0 && zuGross.length === 0;

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

  const alsPause = () => speichern({
    pausen: [
      ...(abschluss?.pausen || []),
      ...offeneLoecher.map((l) => ({ von: uhr(l.von), bis: uhr(l.bis) })),
    ],
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
    <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 bg-white rounded border" style={{ borderColor: RITTLER.line }}>
      <p className="text-sm flex-1 min-w-[240px]" style={{ color: zuGross.length ? STATUS_COLORS.attention : RITTLER.textSecondary }}>
        {auswertung.anzahl === 0
          ? 'Für diesen Tag liegt keine Buchung vor — erfassen oder als frei abschließen.'
          : zuGross.length
            ? `Es fehlen ${dauerText(fehlt)}: ${zuGross.map((l) => `${uhr(l.von)}–${uhr(l.bis)}`).join(', ')}. Buchen oder als Pause vermerken.`
            : 'Keine offene Lücke — der Tag kann abgeschlossen werden.'}
      </p>

      <div className="flex items-center gap-2 shrink-0">
        {offeneLoecher.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={alsPause}
            className="h-9 px-4 rounded border text-xs font-bold uppercase tracking-wide flex items-center gap-2 disabled:opacity-40"
            style={{ borderColor: RITTLER.black, color: RITTLER.black }}
          >
            <Coffee className="w-3.5 h-3.5" /> {dauerText(offenSumme)} als Pause
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => abschliessen('frei')}
          className="h-9 px-4 rounded border text-xs font-bold uppercase tracking-wide disabled:opacity-40"
          style={{ borderColor: RITTLER.line, color: RITTLER.textSecondary }}
        >
          Als frei abschließen
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
  );
}