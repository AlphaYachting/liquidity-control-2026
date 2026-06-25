import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatCurrency } from '@/lib/liquidityUtils';

const COLORS = ['hsl(221, 83%, 53%)', 'hsl(142, 71%, 45%)', 'hsl(38, 92%, 50%)', 'hsl(262, 83%, 58%)', 'hsl(199, 89%, 48%)'];

export default function PipelineChart({ projects, contracts, planLines }) {
  // Offener Projektbetrag (noch nicht verrechnet) — nicht das Gesamtvolumen
  const projectAmt = projects
    .filter(p => p.status !== 'cancelled' && p.status !== 'completed')
    .reduce((s, p) => s + (Number(p.open_amount) || Math.max(0, (Number(p.total_net_amount) || 0) - (Number(p.already_invoiced_amount) || 0))), 0);

  // Verträge: MRR × 12 als annualisierter Wert (aktive Verträge)
  const activeContracts = contracts.filter(c => c.status === 'active' || c.status === 'pending');
  const contractAnnual = (type) => activeContracts
    .filter(c => c.contract_type === type)
    .reduce((s, c) => s + (Number(c.annual_amount) || Number(c.monthly_fixed_price) * 12 || 0), 0);

  const omAmt = contractAnnual('online_marketing');
  const maintAmt = contractAnnual('maintenance');
  const suppAmt = contractAnnual('support');
  const hostAmt = contractAnnual('hosting') + contractAnnual('domain');
  const otherAmt = planLines.filter(l => l.direction === 'inflow' && l.parent_type === 'manual').reduce((s, l) => s + (Number(l.amount_net) || 0), 0);

  const data = [
    { name: 'Projekte (offen)', value: projectAmt },
    { name: 'Online Marketing', value: omAmt },
    { name: 'Wartung & Support', value: maintAmt + suppAmt },
    { name: 'Hosting & Domains', value: hostAmt },
    { name: 'Sonstiges', value: otherAmt },
  ].filter(d => d.value > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Revenue Pipeline nach Kategorie</CardTitle>
        <p className="text-xs text-muted-foreground">Offene Projektbeträge + annualisierte Verträge (aktive)</p>
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