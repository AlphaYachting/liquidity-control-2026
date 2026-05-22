import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, Legend } from 'recharts';
import { formatCurrency, MONTHS_2026, MONTH_LABELS } from '@/lib/liquidityUtils';

const MONTHS = MONTHS_2026;

// Build monthly cashflow from real data sources:
// Inflows: ProjectBillingBlocks grouped by billing_month + RecurringContracts (monthly)
// Outflows: Payables grouped by due month + LiquidityPlanLines (outflow)
function buildCashflowData({ blocks = [], contracts = [], planLines = [], payables = [] }) {
  const inflows = {};
  const outflows = {};
  MONTHS.forEach(m => { inflows[m] = 0; outflows[m] = 0; });

  // Billing blocks → planned inflows
  blocks.forEach(b => {
    const m = b.billing_month;
    if (m && inflows[m] !== undefined) {
      const prob = (b.probability_percent ?? 90) / 100;
      inflows[m] += (Number(b.amount_net) || 0) * prob;
    }
  });

  // Recurring contracts → monthly inflows spread across year
  contracts.forEach(c => {
    if (c.status === 'cancelled') return;
    const monthly = Number(c.monthly_fixed_price) || 0;
    if (c.billing_interval === 'monthly' && monthly > 0) {
      MONTHS.forEach(m => { inflows[m] += monthly; });
    } else if (c.billing_interval === 'quarterly' && monthly > 0) {
      ['2026-01', '2026-04', '2026-07', '2026-10'].forEach(m => {
        if (inflows[m] !== undefined) inflows[m] += monthly * 3;
      });
    } else if (c.billing_interval === 'yearly') {
      const annual = Number(c.annual_amount) || 0;
      if (annual > 0 && inflows['2026-01'] !== undefined) inflows['2026-01'] += annual;
    }
  });

  // Plan lines (explicit overrides / manual entries)
  planLines.forEach(l => {
    if (l.status === 'cancelled') return;
    const m = l.month;
    if (!m) return;
    const net = Number(l.amount_net) || 0;
    if (l.direction === 'inflow' && inflows[m] !== undefined) inflows[m] += net;
    if (l.direction === 'outflow' && outflows[m] !== undefined) outflows[m] += net;
  });

  // Payables → outflows by due month
  payables.forEach(p => {
    if (p.status === 'paid') return;
    const due = p.due_date || p.payment_planned_date;
    if (!due) return;
    const m = due.slice(0, 7);
    if (outflows[m] !== undefined) outflows[m] += Number(p.gross_amount) || 0;
  });

  let balance = 0;
  return MONTHS.map(m => {
    const inf = inflows[m];
    const out = outflows[m];
    balance += inf - out;
    return {
      month: m,
      label: MONTH_LABELS[m] || m,
      inflows: Math.round(inf),
      outflows: Math.round(out),
      closing: Math.round(balance),
    };
  });
}

export default function CashflowChart({ planLines = [], blocks = [], contracts = [], payables = [] }) {
  const data = buildCashflowData({ blocks, contracts, planLines, payables });
  const hasData = data.some(d => d.inflows > 0 || d.outflows > 0);

  const customTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border rounded-lg p-3 shadow-lg text-xs">
        <p className="font-semibold mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }}>{p.name}: {formatCurrency(p.value)}</p>
        ))}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Monatlicher Cashflow 2026</CardTitle>
        {!hasData && (
          <p className="text-xs text-muted-foreground">Basiert auf Abrechnungspaketen (geplant)</p>
        )}
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-[320px] flex items-center justify-center text-muted-foreground text-sm">
            Keine Daten vorhanden. Bitte Abrechnungspakete oder Liquiditätsplan befüllen.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={customTooltip} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="inflows" name="Zuflüsse" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="outflows" name="Abflüsse" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
              <Line dataKey="closing" name="Kumuliert" stroke="hsl(221, 83%, 53%)" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}