import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, Legend } from 'recharts';
import { calculateMonthlyProjection, formatCurrency, getMonthLabel } from '@/lib/liquidityUtils';

export default function CashflowChart({ planLines }) {
  const data = calculateMonthlyProjection(planLines, 0);

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
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
            <Tooltip content={customTooltip} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="inflows" name="Zuflüsse" fill="hsl(142, 71%, 45%)" radius={[4,4,0,0]} />
            <Bar dataKey="outflows" name="Abflüsse" fill="hsl(0, 84%, 60%)" radius={[4,4,0,0]} />
            <Line dataKey="closing" name="Saldo" stroke="hsl(221, 83%, 53%)" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}