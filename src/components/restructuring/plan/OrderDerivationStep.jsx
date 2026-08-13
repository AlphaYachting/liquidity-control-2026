import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ChevronDown, ExternalLink } from 'lucide-react';
import { fmtEUR } from '@/lib/restructuring/restructuringFormat';

/** Ein Schritt der Herleitung — aufklappbar auf die zugrunde liegenden Aufträge. */
export default function OrderDerivationStep({ step }) {
  const [open, setOpen] = useState(false);
  const negative = step.amount < 0;

  return (
    <div className="border-b border-border/60 last:border-0">
      <button
        type="button"
        onClick={() => step.rows.length > 0 && setOpen((o) => !o)}
        className="w-full flex items-start gap-2 py-2.5 text-left hover:bg-muted/40 px-2 rounded"
      >
        <span className="w-5 flex-shrink-0 pt-0.5 text-muted-foreground">
          {step.rows.length > 0
            ? (open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />)
            : null}
        </span>
        <span className="w-5 flex-shrink-0 text-[11px] font-bold text-muted-foreground pt-0.5">{step.no}.</span>
        <span className="flex-1 min-w-0">
          <span className="block text-xs font-semibold">{step.label}</span>
          <span className="block text-[11px] text-muted-foreground mt-0.5">{step.note}</span>
          {step.rows.length > 0 && (
            <span className="block text-[10px] text-muted-foreground mt-0.5">{step.rows.length} Positionen — aufklappen</span>
          )}
        </span>
        <span className={`text-xs font-bold tabular-nums whitespace-nowrap pt-0.5 ${negative ? 'text-red-600' : ''}`}>
          {fmtEUR(step.amount)}
        </span>
      </button>

      {open && (
        <div className="pl-12 pr-2 pb-3">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-muted-foreground border-b">
                <th className="text-left py-1">Auftrag</th>
                <th className="text-left py-1">Kunde</th>
                <th className="text-left py-1">Projekt</th>
                <th className="text-right py-1">Betrag</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {step.rows.map((r) => (
                <tr key={r.id} className="border-b border-border/40">
                  <td className="py-1">{r.order_number || '—'}</td>
                  <td className="py-1">{r.customer || '—'}</td>
                  <td className="py-1">{r.project_name || '—'}</td>
                  <td className="py-1 text-right tabular-nums">{fmtEUR(r._amount)}</td>
                  <td className="py-1 text-right">
                    <Link
                      to={r.project_id ? `/projects/${r.project_id}` : '/projects'}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Projekt <ExternalLink className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}