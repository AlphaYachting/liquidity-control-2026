import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { formatCurrency } from '@/lib/liquidityUtils';
import { addDays, format, parseISO, isValid, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';

/**
 * Zeigt einen 5-Tage-Index-Cashflow-Forecast für die nächsten ~60 Tage.
 * Offene Rechnungen werden gleichmäßig über ihre Laufzeit (Rechnungsdatum → Fälligkeitsdatum) verteilt
 * und in 5-Tage-Buckets aggregiert.
 */
export default function CashflowForecastChart({ invoiceRecords = [] }) {
  const data = useMemo(() => {
    const today = startOfDay(new Date());
    const endDate = addDays(today, 62); // ~2 Monate

    // Nur offene/überfällige Rechnungen mit Betrag
    const openInvoices = invoiceRecords.filter(inv =>
      inv.payment_status !== 'paid' &&
      inv.payment_status !== 'cancelled' &&
      (Number(inv.open_amount) > 0 || Number(inv.gross_amount) > 0)
    );

    // Tägliche Einzahlungs-Map
    const dailyMap = {};
    for (let i = 0; i <= 62; i++) {
      const d = format(addDays(today, i), 'yyyy-MM-dd');
      dailyMap[d] = 0;
    }

    openInvoices.forEach(inv => {
      const amount = Number(inv.open_amount) > 0 ? Number(inv.open_amount) : Number(inv.gross_amount);
      if (!amount || amount <= 0) return;

      // Startpunkt: heute oder Rechnungsdatum (falls in der Zukunft)
      let start = today;
      if (inv.invoice_date) {
        const id = parseISO(inv.invoice_date);
        if (isValid(id) && id > today) start = id;
      }

      // Endpunkt: Fälligkeitsdatum oder +30 Tage als Fallback
      let end = addDays(start, 30);
      if (inv.due_date) {
        const dd = parseISO(inv.due_date);
        if (isValid(dd)) {
          end = dd > today ? dd : addDays(today, 5); // Überfällige: innerhalb 5 Tage
        }
      }

      // Clamp auf Forecast-Fenster
      if (start > endDate) return;
      if (end > endDate) end = endDate;

      // Gleichmäßig auf Tage verteilen
      let days = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
      const daily = amount / days;

      for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
        const key = format(d, 'yyyy-MM-dd');
        if (dailyMap[key] !== undefined) dailyMap[key] += daily;
      }
    });

    // Aggregation in 5-Tage-Buckets
    const buckets = [];
    let i = 0;
    while (i <= 60) {
      const bucketStart = addDays(today, i);
      const bucketEnd = addDays(today, Math.min(i + 4, 62));
      let sum = 0;
      for (let d = new Date(bucketStart); d <= bucketEnd; d = addDays(d, 1)) {
        const key = format(d, 'yyyy-MM-dd');
        if (dailyMap[key]) sum += dailyMap[key];
      }
      buckets.push({
        label: format(bucketStart, 'dd.MM.', { locale: de }),
        dateKey: format(bucketStart, 'yyyy-MM-dd'),
        amount: Math.round(sum),
        isToday: i === 0,
      });
      i += 5;
    }

    // Kumulierter Verlauf
    let cumulative = 0;
    return buckets.map(b => {
      cumulative += b.amount;
      return { ...b, cumulative: Math.round(cumulative) };
    });
  }, [invoiceRecords]);

  const totalExpected = data.reduce((s, d) => s + d.amount, 0);
  const next30 = data.slice(0, 6).reduce((s, d) => s + d.amount, 0);

  const customTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border rounded-lg p-3 shadow-lg text-xs space-y-1">
        <p className="font-semibold">Ab {label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }}>{p.name}: {formatCurrency(p.value)}</p>
        ))}
      </div>
    );
  };

  const hasData = data.some(d => d.amount > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Geldeingang-Forecast (60 Tage)</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Offene Rechnungen · 5-Tage-Index · gleichmäßig verteilt</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Nächste 30 Tage</p>
            <p className="text-sm font-bold text-emerald-600">{formatCurrency(next30)}</p>
            <p className="text-xs text-muted-foreground mt-1">Gesamt 60 Tage</p>
            <p className="text-sm font-semibold">{formatCurrency(totalExpected)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
            Keine offenen Rechnungen vorhanden. Bitte erst Rechnungen aus sevDesk synchronisieren.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="cfGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={customTooltip} />
              <ReferenceLine x={data[0]?.label} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 2" label={{ value: 'Heute', fontSize: 9 }} />
              <Area
                type="monotone"
                dataKey="amount"
                name="Geldeingang (5d)"
                stroke="hsl(142, 71%, 45%)"
                strokeWidth={2}
                fill="url(#cfGrad)"
              />
              <Area
                type="monotone"
                dataKey="cumulative"
                name="Kumuliert"
                stroke="hsl(221, 83%, 53%)"
                strokeWidth={2}
                fill="url(#cumGrad)"
                strokeDasharray="5 3"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}