import React from 'react';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2 } from 'lucide-react';
import { fmtEUR, fmtDate } from '@/lib/restructuring/restructuringFormat';
import { PLAN_CATEGORY_LABELS, CLAIM_TYPE_LABELS } from '@/lib/restructuring/cashflowPlan';

const claimClass = (t) =>
  t === 'alt' ? 'text-amber-700' : t === 'neu' ? 'text-emerald-700' : 'text-purple-700';

export default function CashflowPlanGroup({ category, items, patternName, onEdit, onDelete }) {
  const sum = (f) => items.reduce((s, i) => s + (Number(i[f]) || 0), 0);

  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between px-2 py-1.5 bg-muted/50 rounded">
        <p className="text-xs font-bold">{PLAN_CATEGORY_LABELS[category] || category}</p>
        <p className="text-xs tabular-nums">
          {fmtEUR(sum('amount_gross'))}
          <span className="text-muted-foreground"> · ALT {fmtEUR(sum('amount_alt_gross'))} · NEU {fmtEUR(sum('amount_neu_gross'))}</span>
        </p>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-1.5 px-2">Bezeichnung</th>
            <th className="text-left py-1.5 px-2">A/N</th>
            <th className="text-right py-1.5 px-2">Betrag brutto</th>
            <th className="text-right py-1.5 px-2">davon ALT</th>
            <th className="text-right py-1.5 px-2">davon NEU</th>
            <th className="text-left py-1.5 px-2">Rechnungsdatum</th>
            <th className="text-left py-1.5 px-2">Staffel</th>
            <th className="text-left py-1.5 px-2">Herleitung</th>
            <th className="py-1.5 px-2"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-b border-border/50 align-top">
              <td className="py-1.5 px-2">
                {i.label}
                {i.customer_or_supplier && <span className="text-muted-foreground"> · {i.customer_or_supplier}</span>}
                {i.scenario_only && <span className="ml-1.5 text-[10px] font-semibold text-purple-700">(nur Szenario)</span>}
              </td>
              <td className={`py-1.5 px-2 font-semibold ${claimClass(i.claim_type)}`}>{CLAIM_TYPE_LABELS[i.claim_type]}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{fmtEUR(i.amount_gross)}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{fmtEUR(i.amount_alt_gross)}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{fmtEUR(i.amount_neu_gross)}</td>
              <td className="py-1.5 px-2">{i.invoice_date ? fmtDate(i.invoice_date) : '—'}</td>
              <td className="py-1.5 px-2">
                {i.fixed_week_index ? `fix W${i.fixed_week_index}` : (patternName(i.payment_pattern_id) || '—')}
              </td>
              <td className="py-1.5 px-2 text-muted-foreground max-w-[16rem]">{i.derivation || '—'}</td>
              <td className="py-1.5 px-2 text-right whitespace-nowrap">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(i)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => onDelete(i.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}