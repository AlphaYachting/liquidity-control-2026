import React from 'react';
import useProjektAufgaben from '@/hooks/useProjektAufgaben';

// Fortschritt in vier getrennten Balken — keine gemischte Gesamtzahl.
// Aufgaben und Zeitbudget stehen bewusst nebeneinander, damit ein Auseinanderlaufen sichtbar wird.

const std = (min) => Math.round((min || 0) / 60);

function Balken({ label, value, subtitle, colorClass, muted }) {
  return (
    <div className="bg-card rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <span className={`text-sm font-bold ${muted ? 'text-muted-foreground' : colorClass.text}`}>
          {Math.round(value)}%
        </span>
      </div>
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${muted ? 'bg-muted-foreground/40' : colorClass.bar}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export default function ProjectProgressBlock({ projectId, aworkProjectId, billingPct = 0, paymentPct = 0, showFinancialBars = true }) {
  const { kennzahlen } = useProjektAufgaben({ projectId, aworkProjectId });
  const veraltet = kennzahlen.daten_veraltet;

  const aufgabenPct = kennzahlen.erledigt_prozent;
  const budgetPct = kennzahlen.budget_verbraucht_prozent;

  const balken = [
    {
      label: 'Aufgaben erledigt',
      value: aufgabenPct,
      subtitle: `${kennzahlen.erledigt} von ${kennzahlen.gesamt} erledigt`,
      colorClass: { bar: 'bg-status-done', text: 'text-status-done-text' },
    },
  ];

  if (budgetPct !== null) {
    balken.push({
      label: 'Zeitbudget verbraucht',
      value: budgetPct,
      subtitle: `${std(kennzahlen.gebuchte_minuten)} von ${std(kennzahlen.geplante_minuten)} Stunden`,
      colorClass: { bar: 'bg-status-attention', text: 'text-status-attention' },
    });
  }

  if (showFinancialBars) {
    balken.push(
      { label: 'Abrechnungsfortschritt', value: billingPct, subtitle: null, colorClass: { bar: 'bg-primary', text: 'text-primary' } },
      { label: 'Zahlungsfortschritt', value: paymentPct, subtitle: null, colorClass: { bar: 'bg-status-neutral', text: 'text-status-neutral' } },
    );
  }

  const laeuftAuseinander = budgetPct !== null && budgetPct - aufgabenPct > 20;

  const standLabel = kennzahlen.zuletzt_synchronisiert
    ? new Date(kennzahlen.zuletzt_synchronisiert).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })
    : null;

  return (
    <div className="space-y-2">
      {veraltet && (
        <p className="text-xs text-muted-foreground">
          Stand vom {standLabel || '—'}, nicht aktuell
        </p>
      )}
      <div className={`grid gap-3 ${balken.length === 4 ? 'grid-cols-2 lg:grid-cols-4' : balken.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {balken.map(b => <Balken key={b.label} {...b} muted={veraltet} />)}
      </div>
      {laeuftAuseinander && (
        <p className="text-xs text-status-critical">
          Es wird schneller Budget verbraucht als Arbeit fertig — {budgetPct} % der Zeit verbraucht,
          {' '}{aufgabenPct} % der Aufgaben erledigt.
        </p>
      )}
    </div>
  );
}