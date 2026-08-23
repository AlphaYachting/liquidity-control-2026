import React, { useState } from 'react';
import { Lock, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { uhr, dauerText } from '@/lib/zeit/tagesAuswertung';

const MAX_LUECKE = 45;

// Tag festschreiben. Erst wenn keine Lücke über 45 Minuten offen ist.
export default function TagAbschliessen({ auswertung, abschluss, email, tag, onSaved }) {
  const [busy, setBusy] = useState(false);
  const bestaetigt = !!abschluss?.bestaetigt_am;

  const zuGross = auswertung.loecher.filter((l) => l.minuten > MAX_LUECKE);
  const fehlt = zuGross.reduce((s, l) => s + l.minuten, 0);

  const abschliessen = async () => {
    setBusy(true);
    const daten = { bestaetigt_am: new Date().toISOString(), bestaetigt_von: email };
    if (abschluss) await base44.entities.Tagesabschluss.update(abschluss.id, daten);
    else await base44.entities.Tagesabschluss.create({ person_email: email, tag, tagesnorm_minuten: 480, ...daten });
    setBusy(false);
    onSaved?.();
  };

  if (bestaetigt) {
    return (
      <div className="flex items-center gap-2 px-3 py-3 bg-white rounded border" style={{ borderColor: RITTLER.line }}>
        <CheckCircle2 className="w-4 h-4" style={{ color: STATUS_COLORS.done }} />
        <p className="text-sm" style={{ color: RITTLER.textSecondary }}>
          Tag abgeschlossen — Änderungen entstehen als Korrekturbuchung.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 px-3 py-3 bg-white rounded border" style={{ borderColor: RITTLER.line }}>
      <p className="text-sm" style={{ color: zuGross.length ? STATUS_COLORS.attention : RITTLER.textSecondary }}>
        {zuGross.length
          ? `Es fehlen ${dauerText(fehlt)}: ${zuGross.map((l) => `${uhr(l.von)}–${uhr(l.bis)}`).join(', ')}. Buchen oder als Pause vermerken.`
          : 'Keine offene Lücke — der Tag kann abgeschlossen werden.'}
      </p>
      <button
        type="button"
        disabled={busy || zuGross.length > 0}
        onClick={abschliessen}
        className="h-9 px-4 rounded text-white text-xs font-bold uppercase tracking-wide shrink-0 flex items-center gap-2 disabled:opacity-40"
        style={{ backgroundColor: RITTLER.pink }}
      >
        <Lock className="w-3.5 h-3.5" />
        Tag abschließen
      </button>
    </div>
  );
}