import React from 'react';
import { RITTLER } from '@/components/sprint/sprintConfig';
import BuchungZeile from './BuchungZeile';
import { regelnFuer } from '@/lib/zeit/rundung';

// Jede Buchung des Tages als Zeile — Korrekturen stehen unter ihrem Original.
export default function Buchungsliste({ auswertung, eintraege, projektLabel, gesperrt, projekteById = {}, settings = {}, onAendern, onLoeschen, onGeaendert }) {
  const regelnVon = (e) => regelnFuer(projekteById[e.project_id], settings);
  const ueberschneidend = new Set(auswertung.blocks.filter((b) => b.ueberschneidet).map((b) => b.entry.id));

  if (!eintraege.length) {
    return (
      <p className="p-8 text-center text-sm bg-white rounded border" style={{ borderColor: RITTLER.line, color: RITTLER.textSecondary }}>
        Für diesen Tag ist nichts erfasst.
      </p>
    );
  }

  const korrekturen = eintraege.filter((e) => e.korrektur_zu);
  const korrekturenZu = korrekturen.reduce((acc, k) => {
    (acc[k.korrektur_zu] = acc[k.korrektur_zu] || []).push(k);
    return acc;
  }, {});
  const originale = eintraege.filter((e) => !e.korrektur_zu);

  return (
    <div className="bg-white rounded border divide-y" style={{ borderColor: RITTLER.line }}>
      {originale.map((e) => (
        <React.Fragment key={e.id}>
          <BuchungZeile
            eintrag={e}
            label={projektLabel(e)}
            ueberschneidet={ueberschneidend.has(e.id)}
            gesperrt={gesperrt}
            korrigiert={!!korrekturenZu[e.id]}
            regeln={regelnVon(e)}
            onAendern={onAendern}
            onLoeschen={onLoeschen}
            onGeaendert={onGeaendert}
          />
          {(korrekturenZu[e.id] || []).map((k) => (
            <BuchungZeile key={k.id} eintrag={k} label={projektLabel(k)} istKorrektur gesperrt />
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}