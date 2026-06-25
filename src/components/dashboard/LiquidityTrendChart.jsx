import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';
import { formatCurrency, MONTHS_2026, MONTH_LABELS } from '@/lib/liquidityUtils';

const TODAY_MONTH = new Date().toISOString().slice(0, 7);

function buildTrendData(orders = [], blocks = [], invoices = [], contracts = []) {
  const invoicedByMonth = {};
  const plannedByMonth = {};
  MONTHS_2026.forEach(m => {
    invoicedByMonth[m] = 0;
    plannedByMonth[m] = 0;
  });

  // 1. Bereits verrechnet: aus InvoiceRecords nach invoice_date (nur bezahlte + offene, keine Gutschriften)
  const paidInvoices = invoices.filter(inv => inv.payment_status !== 'cancelled' && !inv.is_credit_note);
  paidInvoices.forEach(inv => {
    const m = (inv.invoice_date || '').slice(0, 7);
    if (invoicedByMonth[m] !== undefined) {
      invoicedByMonth[m] += Number(inv.net_amount) || 0;
    }
  });

  // 2. Geplant: BillingBlocks die noch nicht verrechnet sind, nach billing_month
  const linkedBlockIds = new Set(invoices.map(i => i.billing_block_id).filter(Boolean));
  blocks.forEach(b => {
    if (b.invoice_readiness_status === 'invoiced' || b.invoice_readiness_status === 'paid') return;
    if (linkedBlockIds.has(b.id)) return; // bereits über InvoiceRecord abgedeckt
    const m = b.billing_month;
    if (!m || plannedByMonth[m] === undefined) return;
    const prob = (b.probability_percent ?? 90) / 100;
    plannedByMonth[m] += (Number(b.amount_net) || 0) * prob;
  });

  // 3. Geplant: Aktive monatliche Verträge → in jeden zukünftigen Monat
  const activeContracts = contracts.filter(c => c.status === 'active' && c.billing_interval === 'monthly' && Number(c.monthly_fixed_price) > 0);
  MONTHS_2026.forEach(m => {
    if (m >= TODAY_MONTH) {
      activeContracts.forEach(c => {
        plannedByMonth[m] += Number(c.monthly_fixed_price) || 0;
      });
    }
  });

  // Kumulative Linien aufbauen
  let cumInvoiced = 0;
  let cumPlanned = 0;

  return MONTHS_2026.map(m => {
    cumInvoiced += invoicedByMonth[m];
    cumPlanned += plannedByMonth[m];

    return {
      month: m,
      label: MONTH_LABELS[m] || m,
      invoiced: Math.round(invoicedByMonth[m]),
      planned: Math.round(plannedByMonth[m]),
      cumInvoiced: Math.round(cumInvoiced),
      cumPlanned: Math.round(cumPlanned),
    };
  });
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border rounded-lg p-3 shadow-lg text-xs space-y-1 min-w-[180px]">
      <p className="font-semibold mb-2">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-medium">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function LiquidityTrendChart({ orders = [], blocks = [], invoices = [], contracts = [] }) {
  const data = useMemo(() => buildTrendData(orders, blocks, invoices, contracts), [orders, blocks, invoices, contracts]);

  const hasData = data.some(d => d.invoiced > 0 || d.planned > 0);
  const maxVal = Math.max(...data.map(d => Math.max(d.cumInvoiced, d.cumPlanned)), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">
          Prognose Liquiditätstrend 2026
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Kumuliert: verrechnet (InvoiceRecords) vs. geplant (Pakete + Monatsverträge)
        </p>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
            Keine Daten – bitte Abrechnungspakete oder Aufträge anlegen.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data} margin={{ top: 5, right: 16, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                domain={[0, Math.ceil(maxVal * 1.1 / 1000) * 1000]}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine
                x={MONTH_LABELS[TODAY_MONTH] || TODAY_MONTH}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="4 4"
                label={{ value: 'Heute', position: 'top', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              />
              <Line
                dataKey="cumInvoiced"
                name="Verrechnet (kumuliert)"
                stroke="hsl(142, 71%, 45%)"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                dataKey="cumPlanned"
                name="Geplant (kumuliert, gewichtet)"
                stroke="hsl(221, 83%, 53%)"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}