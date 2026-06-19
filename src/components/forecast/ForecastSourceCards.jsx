import React from 'react';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/lib/liquidityUtils';

const SOURCES = [
  { key_in: 'plan_lines_in',   key_out: 'plan_lines_out',  label: 'Planzeilen',      icon: '📋', colorIn: 'text-blue-600',    colorOut: 'text-blue-400' },
  { key_in: 'contracts_in',    key_out: null,               label: 'Verträge',        icon: '📣', colorIn: 'text-emerald-600', colorOut: null },
  { key_in: 'receivables_in',  key_out: null,               label: 'Forderungen',     icon: '⚠️', colorIn: 'text-amber-600',   colorOut: null },
  { key_in: 'invoice_records_in', key_out: null,            label: 'Rechnungen (echt)', icon: '🧾', colorIn: 'text-indigo-600',  colorOut: null },
  { key_in: null,              key_out: 'tool_costs_out',   label: 'Toolkosten',      icon: '💳', colorIn: null,               colorOut: 'text-purple-600' },
  { key_in: null,              key_out: 'payables_out',     label: 'Verbindlichkeiten', icon: '📄', colorIn: null,             colorOut: 'text-red-600' },
];

export default function ForecastSourceCards({ months }) {
  // Sum across all months for each source
  const totals = months.reduce((acc, m) => {
    const b = m.source_breakdown || {};
    Object.keys(b).forEach(k => { acc[k] = (acc[k] || 0) + b[k]; });
    return acc;
  }, {});

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {SOURCES.map((s) => {
        const inAmount = s.key_in ? (totals[s.key_in] || 0) : 0;
        const outAmount = s.key_out ? (totals[s.key_out] || 0) : 0;
        const total = inAmount - outAmount;
        const isNet = s.key_in && s.key_out;

        return (
          <Card key={s.label} className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{s.icon}</span>
              <span className="text-xs font-semibold text-muted-foreground">{s.label}</span>
            </div>
            {s.key_in && (
              <p className={`text-sm font-bold ${s.colorIn}`}>
                +{formatCurrency(inAmount)}
              </p>
            )}
            {s.key_out && (
              <p className={`text-sm font-bold ${s.colorOut}`}>
                −{formatCurrency(outAmount)}
              </p>
            )}
            {isNet && (
              <p className={`text-xs mt-1 ${total >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                Net: {formatCurrency(total)}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">Jahressumme</p>
          </Card>
        );
      })}
    </div>
  );
}