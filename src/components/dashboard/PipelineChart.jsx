import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatCurrency } from '@/lib/liquidityUtils';

const COLORS = ['hsl(221, 83%, 53%)', 'hsl(142, 71%, 45%)', 'hsl(38, 92%, 50%)', 'hsl(262, 83%, 58%)', 'hsl(199, 89%, 48%)'];

export default function PipelineChart({ projects, contracts, planLines }) {
  const projectAmt = projects.reduce((s, p) => s + (Number(p.total_net_amount) || 0), 0);
  const omAmt = contracts.filter(c => c.contract_type === 'online_marketing').reduce((s, c) => s + (Number(c.annual_amount) || 0), 0);
  const maintAmt = contracts.filter(c => c.contract_type === 'maintenance').reduce((s, c) => s + (Number(c.annual_amount) || 0), 0);
  const suppAmt = contracts.filter(c => c.contract_type === 'support').reduce((s, c) => s + (Number(c.annual_amount) || 0), 0);
  const otherAmt = planLines.filter(l => l.direction === 'inflow' && l.parent_type === 'manual').reduce((s, l) => s + (Number(l.amount_net) || 0), 0);

  const data = [
    { name: 'Projekte', value: projectAmt },
    { name: 'Online Marketing', value: omAmt },
    { name: 'Wartung', value: maintAmt },
    { name: 'Support', value: suppAmt },
    { name: 'Sonstiges', value: otherAmt },
  ].filter(d => d.value > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Revenue Pipeline nach Kategorie</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={3} dataKey="value">
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => formatCurrency(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}