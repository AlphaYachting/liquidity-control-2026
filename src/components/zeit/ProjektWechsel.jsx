import React, { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { useProjektSuche } from '@/lib/zeit/useProjektSuche';
import FeldGruppe from './FeldGruppe';
import FussVerweise from './FussVerweise';

const Zeile = ({ p, onWaehlen }) => (
  <button
    type="button"
    onClick={() => onWaehlen(p)}
    className="w-full text-left py-1.5 flex items-baseline gap-2"
    style={{ borderTop: `1px solid ${RITTLER.line}` }}
  >
    <span className="text-[11px] font-bold uppercase" style={{ color: RITTLER.textSecondary }}>
      {p.kuerzelAnzeige}
    </span>
    <span className="text-[13px] truncate" style={{ color: RITTLER.black }}>
      {p.clientName ? `${p.clientName} · ` : ''}{p.title}
    </span>
  </button>
);

// Nur wählen, nicht starten: der Treffer führt zurück in die Vorwahlansicht.
export default function ProjektWechsel({ email, onWaehlen, onZurueck }) {
  const [text, setText] = useState('');
  const { suche } = useProjektSuche(email);
  const letzte = useMemo(() => suche(''), [suche]);
  const treffer = useMemo(() => suche(text), [suche, text]);
  const liste = text.trim() ? treffer : [];

  return (
    <div className="px-4 pt-[14px] pb-4">
      {letzte.length > 0 && !text.trim() && (
        <div className="mb-[11px]">
          <p className="text-[10.5px] font-semibold tracking-wide uppercase mb-1" style={{ color: RITTLER.textSecondary }}>
            Zuletzt bebucht
          </p>
          {letzte.map((p) => <Zeile key={p.id} p={p} onWaehlen={onWaehlen} />)}
        </div>
      )}

      <FeldGruppe label="Welches Projekt">
        <Input autoFocus placeholder="Kürzel, Kunde oder Titel" value={text} onChange={(e) => setText(e.target.value)} />
      </FeldGruppe>

      {liste.length > 0 && (
        <div className="mt-2">
          {liste.map((p) => <Zeile key={p.id} p={p} onWaehlen={onWaehlen} />)}
        </div>
      )}
      {text.trim() && liste.length === 0 && (
        <p className="mt-2 text-[11.5px]" style={{ color: RITTLER.textSecondary }}>
          Kein Projekt gefunden.
        </p>
      )}

      <FussVerweise links={{ text: '← zurück', onClick: onZurueck }} />
    </div>
  );
}