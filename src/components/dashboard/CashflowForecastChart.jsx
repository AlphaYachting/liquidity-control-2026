import React, { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import { formatCurrency } from '@/lib/liquidityUtils';
import { addDays, format, parseISO, isValid, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { RefreshCw, Zap } from 'lucide-react';
import { base44 } from '@/api/base44Client';

/**
 * Verteilt eine Rechnung/Forderung gleichmäßig über ihre Laufzeit auf die tägliche Map.
 * Überfällige werden auf die nächsten 5 Tage konzentriert.
 */
function distributeToDaily(dailyMap, today, endDate, item) {
  const amount = Number(item.open_amount) > 0 ? Number(item.open_amount) : Number(item.gross_amount);
  if (!amount || amount <= 0) return;

  let start = today;
  if (item.invoice_date) {
    const id = parseISO(item.invoice_date);
    if (isValid(id) && id > today) start = id;
  }

  let end = addDays(start, 30);
  if (item.due_date) {
    const dd = parseISO(item.due_date);
    if (isValid(dd)) {
      end = dd > today ? dd : addDays(today, 5); // Überfällig → nächste 5 Tage
    }
  }

  if (start > endDate) return;
  if (end > endDate) end = endDate;

  const days = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
  const daily = amount / days;

  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    const key = format(d, 'yyyy-MM-dd');
    if (dailyMap[key] !== undefined) dailyMap[key] += daily;
  }
}

function buildForecastData(invoiceRecords, receivables, liveInvoices) {
  const today = startOfDay(new Date());
  const endDate = addDays(today, 62);

  const dailyInvoices = {};
  const dailyReceivables = {};
  const dailyLive = {};
  for (let i = 0; i <= 62; i++) {
    const d = format(addDays(today, i), 'yyyy-MM-dd');
    dailyInvoices[d] = 0;
    dailyReceivables[d] = 0;
    dailyLive[d] = 0;
  }

  // DB-Rechnungen (InvoiceRecord)
  const openInvoices = invoiceRecords.filter(inv =>
    inv.payment_status !== 'paid' &&
    inv.payment_status !== 'cancelled' &&
    (Number(inv.open_amount) > 0 || Number(inv.gross_amount) > 0)
  );
  openInvoices.forEach(inv => distributeToDaily(dailyInvoices, today, endDate, inv));

  // DB-Forderungen (Receivable)
  const openReceivables = receivables.filter(r =>
    r.status !== 'paid' && r.status !== 'write_off' &&
    Number(r.gross_amount) > 0
  );
  openReceivables.forEach(r => distributeToDaily(dailyReceivables, today, endDate, {
    gross_amount: r.gross_amount,
    open_amount: r.gross_amount, // Receivable hat kein open_amount
    invoice_date: r.invoice_date,
    due_date: r.due_date,
  }));

  // Live sevDesk Rechnungen (nicht doppelt zählen mit DB — nach Invoice-Nummer deduplizieren)
  const dbInvoiceNumbers = new Set(invoiceRecords.map(i => i.invoice_number).filter(Boolean));
  const dedupedLive = (liveInvoices || []).filter(inv => !dbInvoiceNumbers.has(inv.invoice_number));
  dedupedLive.forEach(inv => distributeToDaily(dailyLive, today, endDate, inv));

  // 5-Tage-Buckets
  const buckets = [];
  let i = 0;
  while (i <= 60) {
    const bucketStart = addDays(today, i);
    const bucketEnd = addDays(today, Math.min(i + 4, 62));
    let sumInvoices = 0, sumReceivables = 0, sumLive = 0;
    for (let d = new Date(bucketStart); d <= bucketEnd; d = addDays(d, 1)) {
      const key = format(d, 'yyyy-MM-dd');
      if (dailyInvoices[key]) sumInvoices += dailyInvoices[key];
      if (dailyReceivables[key]) sumReceivables += dailyReceivables[key];
      if (dailyLive[key]) sumLive += dailyLive[key];
    }
    buckets.push({
      label: format(bucketStart, 'dd.MM.', { locale: de }),
      invoices: Math.round(sumInvoices),
      receivables: Math.round(sumReceivables),
      live: Math.round(sumLive),
      total: Math.round(sumInvoices + sumReceivables + sumLive),
    });
    i += 5;
  }

  let cumulative = 0;
  return buckets.map(b => {
    cumulative += b.total;
    return { ...b, cumulative: Math.round(cumulative) };
  });
}

export default function CashflowForecastChart({ invoiceRecords = [], receivables = [] }) {
  const [liveInvoices, setLiveInvoices] = useState(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [liveError, setLiveError] = useState(null);

  const handleFetchLive = async () => {
    setLoadingLive(true);
    setLiveError(null);
    try {
      const res = await base44.functions.invoke('fetchSevdeskReceivablesLive', {});
      setLiveInvoices(res.data?.invoices || []);
    } catch (e) {
      setLiveError(e?.response?.data?.error || e.message);
    } finally {
      setLoadingLive(false);
    }
  };

  const data = useMemo(
    () => buildForecastData(invoiceRecords, receivables, liveInvoices || []),
    [invoiceRecords, receivables, liveInvoices]
  );

  const totalExpected = data.reduce((s, d) => s + d.total, 0);
  const next30 = data.slice(0, 6).reduce((s, d) => s + d.total, 0);
  const hasData = data.some(d => d.total > 0);

  const customTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border rounded-lg p-3 shadow-lg text-xs space-y-1">
        <p className="font-semibold">Ab {label}</p>
        {payload.map((p, i) => p.value > 0 && (
          <p key={i} style={{ color: p.color }}>{p.name}: {formatCurrency(p.value)}</p>
        ))}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base font-semibold">Geldeingang-Forecast (60 Tage)</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Rechnungen + Forderungen · 5-Tage-Index · gleichmäßig verteilt
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Nächste 30 Tage</p>
              <p className="text-sm font-bold text-emerald-600">{formatCurrency(next30)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Gesamt 60 Tage</p>
              <p className="text-sm font-semibold">{formatCurrency(totalExpected)}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-8 gap-1"
              onClick={handleFetchLive}
              disabled={loadingLive}
            >
              {loadingLive
                ? <><RefreshCw className="w-3 h-3 animate-spin" /> Lade live…</>
                : <><Zap className="w-3 h-3" /> Live aus sevDesk</>
              }
            </Button>
          </div>
        </div>
        {liveInvoices !== null && (
          <div className="flex items-center gap-2 mt-1">
            <Badge className="bg-amber-100 text-amber-800 text-xs">
              +{liveInvoices.length} live (dedupliziert)
            </Badge>
            <span className="text-xs text-muted-foreground">Nicht in DB gespeichert · nur für diesen View</span>
          </div>
        )}
        {liveError && <p className="text-xs text-red-600 mt-1">Fehler: {liveError}</p>}
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-[260px] flex flex-col items-center justify-center gap-3 text-muted-foreground text-sm">
            <p>Keine offenen Rechnungen oder Forderungen vorhanden.</p>
            <Button size="sm" variant="outline" onClick={handleFetchLive} disabled={loadingLive}>
              <Zap className="w-3.5 h-3.5 mr-1" /> Live aus sevDesk laden
            </Button>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="cfInvoices" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cfReceivables" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cfLive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cfCum" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={customTooltip} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <ReferenceLine x={data[0]?.label} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 2" />
              <Area type="monotone" dataKey="invoices" name="Rechnungen (DB)" stackId="1"
                stroke="hsl(142, 71%, 45%)" strokeWidth={1.5} fill="url(#cfInvoices)" />
              <Area type="monotone" dataKey="receivables" name="Forderungen (DB)" stackId="1"
                stroke="hsl(38, 92%, 50%)" strokeWidth={1.5} fill="url(#cfReceivables)" />
              {liveInvoices !== null && (
                <Area type="monotone" dataKey="live" name="Live sevDesk (neu)" stackId="1"
                  stroke="hsl(262, 83%, 58%)" strokeWidth={1.5} fill="url(#cfLive)" />
              )}
              <Area type="monotone" dataKey="cumulative" name="Kumuliert"
                stroke="hsl(221, 83%, 53%)" strokeWidth={2} fill="url(#cfCum)"
                strokeDasharray="5 3" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}