import React from 'react';
import useProjektAufgaben from '@/hooks/useProjektAufgaben';

// Gemeinsamer Kontext beider Reiter — eine Zeile Fakten, rein lesend.

const TAG = 86400000;
const kurz = (iso) => new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });

function restTage(iso) {
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  return Math.round((d - heute) / TAG);
}

function fristText(iso) {
  const rest = restTage(iso);
  if (rest < 0) return `überfällig seit ${Math.abs(rest)} Tagen`;
  if (rest === 0) return 'heute';
  if (rest <= 7) return `in ${rest} Tagen`;
  return kurz(iso);
}

function aktivitaetText(iso) {
  const tage = Math.floor((Date.now() - new Date(iso).getTime()) / TAG);
  if (tage <= 0) return 'letzte Aktivität heute';
  if (tage === 1) return 'letzte Aktivität gestern';
  return `letzte Aktivität vor ${tage} Tagen`;
}

export default function ProjektFaktenzeile({ projectId, aworkProjectId }) {
  const { kennzahlen, quelle } = useProjektAufgaben({ projectId, aworkProjectId });
  if (quelle === 'intern' || !aworkProjectId) return null;

  const veraltet = kennzahlen.daten_veraltet;
  const frist = kennzahlen.naechste_frist;
  const rest = frist ? restTage(frist) : null;

  const fristClass = veraltet
    ? 'text-muted-foreground'
    : rest === null
      ? 'text-muted-foreground'
      : rest < 0
        ? 'text-status-critical'
        : rest <= 7
          ? 'text-status-attention'
          : 'text-muted-foreground';

  return (
    <p className={`text-xs flex items-center gap-1.5 flex-wrap ${veraltet ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
      <span className={fristClass}>
        nächste Frist: {frist ? fristText(frist) : 'kein Termin gesetzt'}
      </span>
      <span>·</span>
      <span>{kennzahlen.offen} Aufgaben offen</span>
      {kennzahlen.blockiert > 0 && (
        <>
          <span>·</span>
          <span className={veraltet ? 'text-muted-foreground' : 'text-status-critical'}>
            {kennzahlen.blockiert} blockiert
          </span>
        </>
      )}
      {kennzahlen.letzte_aktivitaet && (
        <>
          <span>·</span>
          <span>{aktivitaetText(kennzahlen.letzte_aktivitaet)}</span>
        </>
      )}
    </p>
  );
}