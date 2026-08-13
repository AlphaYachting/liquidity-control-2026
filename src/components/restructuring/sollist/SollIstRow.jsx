import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { fmtEUR, fmtPct, fmtDate } from '@/lib/restructuring/restructuringFormat';
import { isSignificant } from '@/lib/restructuring/sollIst';

const Var = ({ pct }) => {
  if (pct === null) return <span className="text-muted-foreground">—</span>;
  const strong = isSignificant(pct);
  return (
    <span className={strong ? (pct < 0 ? 'text-red-600 font-semibold' : 'text-amber-600 font-semibold') : 'text-muted-foreground'}>
      {pct > 0 ? '+' : ''}{fmtPct(pct)}
    </span>
  );
};

export default function SollIstRow({ row, onSave, saving }) {
  const [form, setForm] = useState({});

  useEffect(() => {
    setForm({
      actual_inflow_gross: row.actual?.actual_inflow_gross ?? '',
      actual_outflow_gross: row.actual?.actual_outflow_gross ?? '',
      actual_bank_balance: row.actual?.actual_bank_balance ?? '',
      variance_reason: row.actual?.variance_reason ?? '',
    });
  }, [row.actual]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const commit = () => onSave(row, form);

  const cellInput = (key, placeholder = '') => (
    <Input
      type="number"
      step="0.01"
      value={form[key] ?? ''}
      placeholder={placeholder}
      onChange={(e) => set(key, e.target.value)}
      onBlur={commit}
      className="h-8 text-right text-xs w-28"
    />
  );

  return (
    <tr className={`border-b ${row.is_hearing_week ? 'bg-blue-50/60' : ''}`}>
      <td className="px-2 py-2 text-xs font-medium">
        W{row.week_index}
        {saving && <Loader2 className="w-3 h-3 inline ml-1 animate-spin text-muted-foreground" />}
        {!saving && row.has_actual && <Check className="w-3 h-3 inline ml-1 text-emerald-600" />}
      </td>
      <td className="px-2 py-2 text-[11px] text-muted-foreground whitespace-nowrap">
        {fmtDate(row.week_start)} – {fmtDate(row.week_end)}
      </td>
      <td className="px-2 py-2 text-xs text-right">{fmtEUR(row.plan_inflow)}</td>
      <td className="px-2 py-2 text-right">{cellInput('actual_inflow_gross')}</td>
      <td className="px-2 py-2 text-xs text-right"><Var pct={row.var_inflow} /></td>
      <td className="px-2 py-2 text-xs text-right">{fmtEUR(row.plan_outflow)}</td>
      <td className="px-2 py-2 text-right">{cellInput('actual_outflow_gross')}</td>
      <td className="px-2 py-2 text-xs text-right"><Var pct={row.var_outflow} /></td>
      <td className="px-2 py-2 text-xs text-right">{fmtEUR(row.plan_closing)}</td>
      <td className="px-2 py-2 text-right">{cellInput('actual_bank_balance')}</td>
      <td className="px-2 py-2 text-xs text-right"><Var pct={row.var_balance} /></td>
      <td className="px-2 py-2">
        <Input
          value={form.variance_reason ?? ''}
          onChange={(e) => set('variance_reason', e.target.value)}
          onBlur={commit}
          placeholder={row.needs_reason ? 'Ursache dokumentieren' : 'Bemerkung'}
          className={`h-8 text-xs min-w-[180px] ${row.needs_reason ? 'border-amber-500' : ''}`}
        />
        {row.needs_reason && (
          <div className="flex items-center gap-1 text-[11px] text-amber-700 mt-1">
            <AlertTriangle className="w-3 h-3" />
            Abweichung über 10 % — Ursache ist zu dokumentieren.
          </div>
        )}
      </td>
    </tr>
  );
}