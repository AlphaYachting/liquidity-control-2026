import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { dauerText } from '@/lib/zeit/tagesAuswertung';
import { GRUND_LABEL } from './VerrechenbarSchalter';
import TaetigkeitBalken from './TaetigkeitBalken';

const summe = (rows) => rows.reduce((s, e) => s + (Number(e.duration_minutes) || 0), 0);

// Erscheint erst, wenn alle fünf Tage abgeschlossen sind.
export default function WocheBestaetigen({ tage, abschluesse, eintraege, projektLabel, email, onSaved }) {
  const [busy, setBusy] = useState(false);
  const montag = tage[0];
  const alleAb = tage.every((t) => abschluesse.some((a) => a.tag === t && a.bestaetigt_am));
  if (!alleAb) return null;

  const wochenEintraege = eintraege.filter((e) => tage.includes(e.entry_date));
  const bestaetigt = abschluesse.find((a) => a.tag === montag)?.woche_bestaetigt_am;

  const gesamt = summe(wochenEintraege);
  const verrechenbar = summe(wochenEintraege.filter((e) => e.verrechenbar !== false));
  const nicht = gesamt - verrechenbar;

  const nachGrund = Object.entries(
    wochenEintraege.filter((e) => e.verrechenbar === false).reduce((acc, e) => {
      const k = e.nicht_verrechenbar_grund || 'ohne Grund';
      acc[k] = (acc[k] || 0) + (Number(e.duration_minutes) || 0);
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  const nachProjekt = Object.entries(
    wochenEintraege.reduce((acc, e) => {
      const k = projektLabel(e).voll;
      acc[k] = (acc[k] || 0) + (Number(e.duration_minutes) || 0);
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  const bestaetigen = async () => {
    setBusy(true);
    const daten = { woche_bestaetigt_am: new Date().toISOString(), woche_bestaetigt_von: email };
    const vorhanden = abschluesse.find((a) => a.tag === montag);
    if (vorhanden) await base44.entities.Tagesabschluss.update(vorhanden.id, daten);
    else await base44.entities.Tagesabschluss.create({ person_email: email, tag: montag, ...daten });
    setBusy(false);
    onSaved?.();
  };

  return (
    <div className="bg-white rounded border p-4 space-y-3" style={{ borderColor: RITTLER.line }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[2px]" style={{ color: RITTLER.textSecondary }}>
            Woche im Überblick
          </p>
          <p className="text-[22px] font-bold tabular-nums" style={{ color: RITTLER.black }}>{dauerText(gesamt)}</p>
          <p className="text-sm" style={{ color: RITTLER.textSecondary }}>
            verrechenbar {dauerText(verrechenbar)} · nicht verrechenbar {dauerText(nicht)}
          </p>
        </div>
        {bestaetigt ? (
          <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: STATUS_COLORS.doneText }}>
            <CheckCircle2 className="w-4 h-4" /> Woche bestätigt
          </span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={bestaetigen}
            className="h-9 px-4 rounded text-white text-xs font-bold uppercase tracking-wide shrink-0 disabled:opacity-50"
            style={{ backgroundColor: RITTLER.pink }}
          >
            Woche bestätigen
          </button>
        )}
      </div>

      <div className="pt-2 border-t" style={{ borderColor: RITTLER.line }}>
        <TaetigkeitBalken eintraege={wochenEintraege} titel="Tätigkeit in der Woche" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t" style={{ borderColor: RITTLER.line }}>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: RITTLER.textSecondary }}>
            Nicht verrechenbar nach Grund
          </p>
          {nachGrund.length === 0 ? (
            <p className="text-sm" style={{ color: RITTLER.textSecondary }}>Keine nicht verrechenbare Zeit.</p>
          ) : nachGrund.map(([grund, min]) => (
            <p key={grund} className="text-sm flex justify-between" style={{ color: RITTLER.black }}>
              <span>{GRUND_LABEL[grund] || grund}</span>
              <span className="tabular-nums" style={{ color: RITTLER.textSecondary }}>{dauerText(min)}</span>
            </p>
          ))}
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: RITTLER.textSecondary }}>
            Verteilung auf Projekte
          </p>
          {nachProjekt.map(([projekt, min]) => (
            <p key={projekt} className="text-sm flex justify-between gap-3" style={{ color: RITTLER.black }}>
              <span className="truncate">{projekt}</span>
              <span className="tabular-nums shrink-0" style={{ color: RITTLER.textSecondary }}>{dauerText(min)}</span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}