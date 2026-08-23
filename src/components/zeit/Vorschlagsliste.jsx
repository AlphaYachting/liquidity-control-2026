import React, { useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { bucheZeit } from '@/lib/sprint/useTimer';
import { minuteVonIso, uhr, dauerText } from '@/lib/zeit/tagesAuswertung';

// Vorschläge für das nachträgliche Erfassen — nichts davon wird automatisch gebucht.
export default function Vorschlagsliste({ vorschlaege, email, projektLabel, onErledigt }) {
  const [busy, setBusy] = useState('');
  if (!vorschlaege.length) return null;

  const uebernehmen = async (v) => {
    setBusy(v.id);
    const minuten = minuteVonIso(v.bis) - minuteVonIso(v.von);
    await bucheZeit({
      projectId: v.project_id,
      email,
      durationMinutes: minuten,
      entryDate: v.day,
      startedAt: v.von,
      endedAt: v.bis,
      note: v.vorgeschlagene_notiz || '',
      ticketId: v.ticket_id || undefined,
      quelle: 'spur',
    });
    await base44.entities.Zeitvorschlag.update(v.id, { status: 'uebernommen' });
    setBusy('');
    onErledigt?.();
  };

  const verwerfen = async (v) => {
    setBusy(v.id);
    await base44.entities.Zeitvorschlag.update(v.id, { status: 'verworfen' });
    setBusy('');
    onErledigt?.();
  };

  return (
    <div className="bg-white rounded border divide-y" style={{ borderColor: RITTLER.line }}>
      <div className="flex items-center gap-2 px-3 py-2">
        <Lightbulb className="w-4 h-4" style={{ color: RITTLER.pink }} />
        <p className="text-[11px] font-bold uppercase tracking-[2px]" style={{ color: RITTLER.textSecondary }}>
          Vorschläge aus dem Tagesverlauf
        </p>
      </div>
      {vorschlaege.map((v) => {
        const von = minuteVonIso(v.von);
        const bis = minuteVonIso(v.bis);
        const label = projektLabel(v);
        return (
          <div key={v.id} className="flex items-start gap-3 px-3 py-2.5">
            <div className="w-[150px] shrink-0">
              <p className="text-sm font-semibold tabular-nums" style={{ color: RITTLER.black }}>
                {uhr(von)}–{uhr(bis)}
              </p>
              <p className="text-xs" style={{ color: RITTLER.textSecondary }}>{dauerText(bis - von)}</p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: RITTLER.black }}>{label.voll}</p>
              <p className="text-xs" style={{ color: RITTLER.textSecondary }}>{v.beleg}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={busy === v.id}
                onClick={() => uebernehmen(v)}
                className="h-8 px-3 rounded text-white text-xs font-bold uppercase disabled:opacity-60"
                style={{ backgroundColor: RITTLER.pink }}
              >
                Übernehmen
              </button>
              <button
                type="button"
                disabled={busy === v.id}
                onClick={() => verwerfen(v)}
                className="h-8 px-3 rounded border text-xs font-bold uppercase disabled:opacity-60"
                style={{ borderColor: RITTLER.line, color: RITTLER.textSecondary }}
              >
                Verwerfen
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}