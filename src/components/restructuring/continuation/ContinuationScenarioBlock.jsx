import React from 'react';
import ReportTable from '@/components/restructuring/ReportTable';
import { fmtEUR, OUTFLOW_CATEGORY_LABELS } from '@/lib/restructuring/restructuringFormat';
import { SCENARIO_INFO } from '@/lib/restructuring/continuationProof';

export default function ContinuationScenarioBlock({ scenario, hearingWeek }) {
  const rows = scenario.items.map((i) => ({
    id: i.id,
    label: i.label,
    category: OUTFLOW_CATEGORY_LABELS[i.category] || i.category,
    amount: i.amount_gross,
    einordnung: SCENARIO_INFO[i.category]?.einordnung || 'Masseverbindlichkeit bei Fortführung',
    festgelegt: SCENARIO_INFO[i.category]?.festgelegt_von || 'nicht vom Unternehmen bestimmt',
  }));

  const columns = [
    { key: 'label', label: 'Position' },
    { key: 'category', label: 'Kategorie' },
    { key: 'amount', label: 'Betrag gesamt', align: 'right', render: (r) => fmtEUR(r.amount) },
    { key: 'einordnung', label: 'Rechtliche Einordnung' },
    { key: 'festgelegt', label: 'Betrag wird festgelegt von' },
  ];

  return (
    <div>
      <h3 className="text-xs font-bold">Massekosten, die im Plan noch nicht enthalten sind</h3>
      <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">
        Verwalterentlohnung, Verfahrenskosten und Geschäftsführerbezug werden nicht vom Unternehmen bestimmt und stehen daher außerhalb des Basisplans.
      </p>
      <ReportTable
        columns={columns}
        rows={rows}
        emptyText="Keine Szenariopositionen erfasst — die Szenariosumme beträgt 0 €. Die Kennzahlen entsprechen deshalb exakt dem Ergebnisblock. Das ist kein Fehler."
      />
      <p className="text-[11px] mt-2">
        Szenariosumme gesamt <span className="font-semibold tabular-nums">{fmtEUR(scenario.total)}</span>
        {' · '}davon fällig bis zur Berichtstagsatzung{' '}
        <span className="font-semibold tabular-nums">{fmtEUR(scenario.until_hearing)}</span>
        {!hearingWeek && <span className="text-muted-foreground"> (kein Termin hinterlegt — gerechnet über alle Planwochen)</span>}
      </p>
    </div>
  );
}