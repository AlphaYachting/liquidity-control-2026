import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { MONTHS_2026, getMonthLabel, formatCurrency, weightedAmount } from '@/lib/liquidityUtils';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function RiskTimeline({ planLines }) {
  const monthlyData = MONTHS_2026.map(m => {
    const inflows = planLines
      .filter(l => l.month === m && l.direction === 'inflow' && l.status !== 'cancelled')
      .reduce((s, l) => s + weightedAmount(l.amount_net, l.probability_percent), 0);
    const outflows = planLines
      .filter(l => l.month === m && l.direction === 'outflow' && l.status !== 'cancelled')
      .reduce((s, l) => s + (Number(l.amount_net) || 0), 0);
    return { month: m, label: getMonthLabel(m), inflows, outflows, net: inflows - outflows, risk: outflows > inflows };
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Liquiditätsrisiko Timeline 2026</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
          {monthlyData.map(m => (
            <div key={m.month} className={`p-3 rounded-xl text-center transition-colors ${
              m.risk ? 'bg-red-50 border border-red-200' : 'bg-emerald-50 border border-emerald-200'
            }`}>
              <p className="text-xs font-semibold mb-1">{m.label}</p>
              {m.risk
                ? <AlertTriangle className="w-4 h-4 text-red-500 mx-auto" />
                : <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
              }
              <p className={`text-xs font-medium mt-1 ${m.risk ? 'text-red-600' : 'text-emerald-600'}`}>
                {formatCurrency(m.net)}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}