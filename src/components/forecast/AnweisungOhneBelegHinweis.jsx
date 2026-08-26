import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/liquidityUtils';

export default function AnweisungOhneBelegHinweis({ instructions = [] }) {
  if (instructions.length === 0) return null;
  const summe = instructions.reduce((s, i) => s + (Number(i.instruction_amount_net) || 0), 0);
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-amber-800">
        <AlertTriangle className="w-4 h-4" />
        {instructions.length} Anweisung(en) gelten als verrechnet, haben aber keinen sevDesk-Beleg
        <span className="ml-auto text-xs">{formatCurrency(summe)} netto</span>
      </div>
      <ul className="mt-2 space-y-0.5 text-xs text-amber-900">
        {instructions.slice(0, 8).map(i => (
          <li key={i.id}>{i.customer_name || '—'} · {i.project_name || '—'} · {formatCurrency(i.instruction_amount_net)}</li>
        ))}
        {instructions.length > 8 && <li>… und {instructions.length - 8} weitere</li>}
      </ul>
    </div>
  );
}