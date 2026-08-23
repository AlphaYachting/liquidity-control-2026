import React from 'react';
import { RITTLER } from '@/components/sprint/sprintConfig';

const stunden = (min) => `${(Math.round((min / 60) * 100) / 100).toLocaleString('de-AT')} h`;

// Erfasste gegen verrechnete Zeit — sichtbar, nicht still.
export default function RundungsZeile({ werte, titel }) {
  if (!werte || (!werte.erfasst && !werte.geschaetztAnzahl)) return null;
  const min = Math.round(werte.delta);
  return (
    <p className="text-xs" style={{ color: RITTLER.textSecondary }}>
      {titel ? `${titel}: ` : ''}
      {stunden(werte.erfasst)} erfasst → {stunden(werte.verrechnet)} verrechnet
      {min !== 0 && ` · Rundung ${min > 0 ? '+' : ''}${min} min`}
      . Sie geschieht beim Abrechnen, nicht beim Erfassen.
      {werte.geschaetztAnzahl > 0 && ` ${werte.geschaetztAnzahl} Altbuchung${werte.geschaetztAnzahl === 1 ? '' : 'en'} ausgenommen (nur gerundete Stunden vorhanden).`}
    </p>
  );
}