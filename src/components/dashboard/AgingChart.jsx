import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { calcOverdueDays, getAgingBucket, AGING_LABELS, formatCurrency } from '@/lib/liquidityUtils';

const BUCKET_COLORS = {
  'not_due': 'hsl(142, 71%, 45%)',
  '1_30': 'hsl(38, 92%, 50%)',
  '31_60': 'hsl(25, 95%, 53%)',
  '61_90': 'hsl(0, 84%, 60%)',
  '90_plus': 'hsl(0, 62%, 30%)',
};

export default function AgingChart({ receivables }) {
  const buckets = { not_due: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
  receivables.filter(r => r.status !== 'paid').forEach(r => {
    const days = calcOverdueDays(r.due_date);
    const bucket = getAgingBucket(days);
    buckets[bucket] += Number(r.gross_amount) || 0;
  });

  const data = Object.entries(buckets).map(([key, value]) => ({
    name: AGING_LABELS[key],
    value,
    fill: BUCKET_COLORS[key]
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Forderungen Altersstruktur</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => formatCurrency(v)} />
            <Bar dataKey="value" name="Betrag" radius={[4,4,0,0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}