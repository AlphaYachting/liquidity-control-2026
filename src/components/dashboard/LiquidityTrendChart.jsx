import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';
import { formatCurrency, MONTHS_2026, MONTH_LABELS } from '@/lib/liquidityUtils';

const TODAY_MONTH = new Date().toISOString().slice(0, 7);

function buildTrendData(orders = [], blocks = [], invoices = []) {
  const invoicedByMonth = {};
  const plannedByMonth = {};
  const openByMonth = {};
  MONTHS_2026.forEach(m => {
    invoicedByMonth[m] = 0;
    plannedByMonth[m] = 0;
    openByMonth[m] = 0;
  });

  // Bereits verrechnet: aus InvoiceRecords nach invoice_date
  invoices.forEach(inv => {
    if (inv.payment_status === 'cancelled' || inv.is_credit_note) return;
    const m = (inv.invoice_date || '').slice(0, 7);
    if (invoicedByMonth[m] !== undefined) {
      invoicedByMonth[m] += Number(inv.net_amount) || 0;
    }
  });

  // Geplant & offen: aus BillingBlocks nach billing_month
  blocks.forEach(b => {
    if (b.invoice_readiness_status === 'invoiced' || b.invoice_readiness_status === 'paid') return;
    const m = b.billing_month;
    if (!m || plannedByMonth[m] === undefined) return;
    const prob = (b.probability_percent ?? 90) / 100;
    plannedByMonth[m] += (Number(b.amount_net) || 0) * prob;
  });

  // Offen (nicht verrechnet): aus ConfirmedOrders nach confirmation_date
  // → offener Betrag wird dem Auftragsmonat zugeordnet als "potenzielle Liquidität"
  orders.forEach(o => {
    if (o.status === 'cancelled') return;
    const m = (o.confirmation_date || o.signed_date || '').slice(0, 7);
    if (!m || openByMonth[m] === undefined) return;
    const net = Number(o.total_net_amount) || 0;
    // Bereits verrechnete Anteile abziehen (approximiert via already_invoiced_amount auf Projekt)
    openByMonth[m] += net;
  });

  // Kumulative Linien aufbauen
  let cumInvoiced = 0;
  let cumPlanned = 0;

  return MONTHS_2026.map(m => {
    cumInvoiced += invoicedByMonth[m];
    cumPlanned += plannedByMonth[m];
    const isPast = m < TODAY_MONTH;
    const isCurrent = m === TODAY_MONTH;

    return {
      month: m,
      label: MONTH_LABELS[m] || m,
      invoiced: Math.round(invoicedByMonth[m]),
      planned: Math.round(plannedByMonth[m]),
      cumInvoiced: Math.round(cumInvoiced),
      cumPlanned: Math.round(cumPlanned),
      isPast,
      isCurrent,
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

export default function LiquidityTrendChart({ orders = [], blocks = [], invoices = [] }) {
  const data = useMemo(() => buildTrendData(orders, blocks, invoices), [orders, blocks, invoices]);

  const hasData = data.some(d => d.invoiced > 0 || d.planned > 0);
  const maxVal = Math.max(...data.map(d => Math.max(d.cumInvoiced, d.cumPlanned)), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">
          Prognose Liquiditätstrend 2026
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Kumulierte Netto-Einnahmen: bereits verrechnet vs. geplant (gewichtet)
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