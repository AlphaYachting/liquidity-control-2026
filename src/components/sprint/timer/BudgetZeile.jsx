import React from 'react';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';

const fmt = (v) => new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(v || 0);

// Budgetzeile mit schmalem Balken. Sie informiert, sie blockiert niemals die Buchung.
export default function BudgetZeile({ budget }) {
  if (!budget) return null;
  const { label, gebucht, gesamt } = budget;
  const anteil = gesamt > 0 ? gebucht / gesamt : 0;
  const farbe = anteil >= 1 ? STATUS_COLORS.critical : anteil >= 0.75 ? STATUS_COLORS.attention : RITTLER.textSecondary;
  const rest = gesamt - gebucht;

  return (
    <div className="mt-2">
      <p className="text-[13px]" style={{ color: farbe }}>
        {gesamt > 0 ? (
          <>
            {label}: {fmt(gebucht)} von {fmt(gesamt)} Stunden —{' '}
            <span className="font-bold">
              {rest >= 0 ? `${fmt(rest)} Stunden verbleiben` : `${fmt(Math.abs(rest))} Stunden überschritten`}
            </span>
          </>
        ) : `${label}: ${fmt(gebucht)} Stunden`}
      </p>
      {gesamt > 0 && (
        <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: '#eeeeee' }}>
          <div
            className="h-full"
            style={{ width: `${Math.min(100, anteil * 100)}%`, backgroundColor: farbe }}
          />
        </div>
      )}
    </div>
  );
}