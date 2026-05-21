import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { aggregateByField, formatCurrency } from '@/lib/liquidityUtils';

const DEPT_LABELS = {
  design: 'Design', marketing: 'Marketing', programming: 'Programmierung',
  project_management: 'Projektmanagement', general: 'Allgemein', other: 'Sonstiges'
};

export default function ToolCostChart({ tools }) {
  const byDept = aggregateByField(tools, 'department', 'annual_cost');
  const data = Object.entries(byDept).map(([key, value]) => ({
    name: DEPT_LABELS[key] || key,
    value
  })).sort((a, b) => b.value - a.value);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Toolkosten nach Abteilung</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 10, left: 80, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
            <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={75} />
            <Tooltip formatter={(v) => formatCurrency(v)} />
            <Bar dataKey="value" name="Jahreskosten" fill="hsl(262, 83%, 58%)" radius={[0,4,4,0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}