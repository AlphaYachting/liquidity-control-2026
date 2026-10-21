import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { dauerText } from '@/lib/zeit/tagesAuswertung';
import { useProjektKontext } from '@/lib/sprint/useProjektKontext';
import HauptKnopf from './HauptKnopf';
import FussVerweise from './FussVerweise';

// Ein Klick auf Stoppen bleibt nie folgenlos: scheitert die Buchung, sagt das
// Fenster es ausdrücklich — und der Timer läuft weiter.
export default function NichtGebucht({ info, onNochmal, onWeiterlaufen }) {
  const [busy, setBusy] = useState(false);
  const [notiz, setNotiz] = useState('');
  const { data: pk } = useProjektKontext(info.projectId);
  // Support ohne Ticket: gebucht wird erst mit Beschreibung (21.10.2026)
  const mitNotiz = info.code === 'beschreibung_fehlt';

  const nochmal = async () => {
    setBusy(true);
    await onNochmal(mitNotiz ? notiz.trim() : undefined);
    setBusy(false);
  };

  return (
    <div className="px-4 pt-[14px] pb-4">
      <AlertTriangle className="w-5 h-5" style={{ color: STATUS_COLORS.critical }} />

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

      {mitNotiz && (
        <Input
          autoFocus
          className="mt-3"
          placeholder="Was wurde gemacht?"
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && notiz.trim() && !busy) nochmal(); }}
        />
      )}

      <HauptKnopf
        disabled={busy || (mitNotiz && !notiz.trim())}
        grund={mitNotiz ? 'Es fehlt noch die Beschreibung.' : undefined}
        onClick={nochmal}
      >
        {mitNotiz ? 'Mit Beschreibung buchen' : 'Nochmal versuchen'}
      </HauptKnopf>

      <FussVerweise rechts={{ text: 'Weiterlaufen lassen', onClick: onWeiterlaufen }} />
    </div>
  );
}