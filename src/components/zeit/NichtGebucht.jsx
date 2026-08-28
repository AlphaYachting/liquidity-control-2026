import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { dauerText } from '@/lib/zeit/tagesAuswertung';
import { useProjektKontext } from '@/lib/sprint/useProjektKontext';

// Ein Klick auf Stoppen bleibt nie folgenlos: scheitert die Buchung, sagt das
// Fenster es ausdrücklich — und der Timer läuft weiter.
export default function NichtGebucht({ info, onNochmal, onWeiterlaufen }) {
  const [busy, setBusy] = useState(false);
  const { data: pk } = useProjektKontext(info.projectId);

  const nochmal = async () => {
    setBusy(true);
    await onNochmal();
    setBusy(false);
  };

  return (
    <div className="p-5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5" style={{ color: STATUS_COLORS.critical }} />
        <p className="text-[17px] font-bold" style={{ color: RITTLER.black }}>Nicht gebucht</p>
      </div>

      <p className="text-[13px] mt-2" style={{ color: RITTLER.textSecondary }}>
        Die Buchung konnte nicht gespeichert werden. Der Timer läuft weiter — es ist keine Zeit verloren gegangen.
      </p>

      <div className="mt-3">
        {pk?.client?.name && (
          <p className="text-[11.5px] font-semibold truncate" style={{ color: RITTLER.textSecondary }}>
            {pk.client.name}
          </p>
        )}
        <p className="text-[15px] font-bold" style={{ color: RITTLER.black }}>{info.projekt || 'Projekt'}</p>
        <p className="text-[13px]" style={{ color: STATUS_COLORS.critical }}>
          {dauerText(info.minuten)} gemessen, noch nicht gebucht
        </p>
      </div>

      {info.fehler && (
        <p className="text-[12px] mt-2" style={{ color: RITTLER.textSecondary }}>{info.fehler}</p>
      )}

      <div className="flex gap-2 mt-4">
        <button
          type="button"
          disabled={busy}
          onClick={nochmal}
          className="flex-1 h-11 rounded text-white text-sm font-bold uppercase tracking-wide disabled:opacity-60"
          style={{ backgroundColor: RITTLER.pink }}
        >
          Nochmal versuchen
        </button>
        <button
          type="button"
          onClick={onWeiterlaufen}
          className="h-11 px-4 rounded border-[1.5px] text-sm font-bold uppercase"
          style={{ borderColor: RITTLER.black, color: RITTLER.black }}
        >
          Weiterlaufen lassen
        </button>
      </div>
    </div>
  );
}