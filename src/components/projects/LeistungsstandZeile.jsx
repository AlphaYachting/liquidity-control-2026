import React from 'react';
import useProjektAufgaben from '@/hooks/useProjektAufgaben';

// Beurteilungsgrundlage für die Abrechnungsentscheidung — rein lesend.
// Dieselben Zahlen wie im Reiter "Projektstand", gepflegt wird dort.

const std = (min) => Math.round((min || 0) / 60);
const kurz = (iso) => new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });

function fristText(iso) {
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const tage = Math.round((d - heute) / 86400000);
  return tage < 0 ? `überfällig seit ${Math.abs(tage)} Tagen` : `Nächste Frist: ${kurz(iso)}`;
}

export default function LeistungsstandZeile({ projectId, aworkProjectId, onDetails }) {
  const { kennzahlen, quelle } = useProjektAufgaben({ projectId, aworkProjectId });
  if (quelle === 'intern' || kennzahlen.gesamt === 0) return null;

  const veraltet = kennzahlen.daten_veraltet;
  const aufgabenPct = kennzahlen.erledigt_prozent;
  const budgetPct = kennzahlen.budget_verbraucht_prozent;
  const laeuftAuseinander = budgetPct !== null && budgetPct - aufgabenPct > 20;
  const frist = kennzahlen.naechste_frist;
  const ueberfaellig = frist && fristText(frist).startsWith('überfällig');

  return (
    <div className={`bg-card border rounded-xl p-4 space-y-2 ${veraltet ? 'opacity-70' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Leistungsstand</p>
        <button onClick={onDetails} className="text-xs text-primary hover:underline">
          Details im Projektstand
        </button>
      </div>

      {veraltet && (
        <p className="text-xs text-muted-foreground">
          Stand vom {kennzahlen.zuletzt_synchronisiert ? kurz(kennzahlen.zuletzt_synchronisiert) : '—'}
        </p>
      )}

      <div className={`flex items-center gap-5 flex-wrap text-sm ${veraltet ? 'text-muted-foreground' : ''}`}>
        <span>Aufgaben: {kennzahlen.erledigt} von {kennzahlen.gesamt} erledigt ({aufgabenPct} %)</span>
        {budgetPct !== null && (
          <span>Zeitbudget: {std(kennzahlen.gebuchte_minuten)} von {std(kennzahlen.geplante_minuten)} h ({budgetPct} %)</span>
        )}
        {kennzahlen.blockiert > 0 && (
          <span className={veraltet ? '' : 'text-status-critical'}>{kennzahlen.blockiert} blockiert</span>
        )}
        {frist && (
          <span className={!veraltet && ueberfaellig ? 'text-status-critical' : ''}>{fristText(frist)}</span>
        )}
      </div>

      {laeuftAuseinander && (
        <p className={`text-xs ${veraltet ? 'text-muted-foreground' : 'text-status-critical'}`}>
          Es wird schneller Budget verbraucht als Arbeit fertig — {budgetPct} % der Zeit verbraucht,
          {' '}{aufgabenPct} % der Aufgaben erledigt.
        </p>
      )}
    </div>
  );
}