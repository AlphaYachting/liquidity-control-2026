import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { RITTLER } from '@/components/sprint/sprintConfig';

// Ein Etikett, ein Klick: Diese Zeit war ein Zusatzwunsch des Kunden und gehört nicht zum Auftrag.
// Mit `eintrag` ändert es eine gespeicherte Buchung, mit `wert`/`onWechsel` dient es der Erfassung.
// Die Kennzeichnung trägt später die Begründung für Mehrkosten — sie ändert nichts an der Verrechnung.
export default function MehraufwandSchalter({ eintrag, wert, onWechsel, gesperrt, onSaved }) {
  const [busy, setBusy] = useState(false);
  const an = eintrag ? eintrag.mehrleistung === true : !!wert;

  const klick = async () => {
    if (!eintrag) { onWechsel?.(!an); return; }
    setBusy(true);
    await base44.entities.TimeEntry.update(eintrag.id, { mehrleistung: !an });
    setBusy(false);
    onSaved?.();
  };

  return (
    <button
      type="button"
      disabled={busy || gesperrt}
      onClick={klick}
      aria-pressed={an}
      title="Zusatzwunsch des Kunden, der nicht im Auftrag enthalten ist"
      className="text-[11.5px] px-2 py-0.5 rounded border transition-colors disabled:opacity-50 disabled:cursor-default"
      style={{
        borderColor: an ? RITTLER.pink : RITTLER.line,
        backgroundColor: an ? 'hsl(var(--primary) / 0.08)' : 'transparent',
        color: an ? RITTLER.pink : RITTLER.textSecondary,
        fontWeight: an ? 600 : 400,
      }}
    >
      {an ? '✓ Mehraufwand (Zusatzwunsch)' : '+ Mehraufwand'}
    </button>
  );
}
