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
 * Trägt eine Rechnung/Forderung am Fälligkeitsdatum als Punkt-Eintrag ein.
 * Überfällige werden auf heute gesetzt.
 */
function pinToDaily(dailyMap, today, endDate, item) {
  const amount = Number(item.open_amount) > 0 ? Number(item.open_amount) : Number(item.gross_amount);
  if (!amount || amount <= 0) return;

  let targetDate = today; // Fallback: heute
  if (item.due_date) {
    const dd = parseISO(item.due_date);
    if (isValid(dd)) {
      targetDate = dd < today ? today : dd; // Überfällig → heute
    }
  } else if (item.invoice_date) {
    // Kein Fälligkeitsdatum: 30 Tage nach Rechnungsdatum annehmen
    const id = parseISO(item.invoice_date);
    if (isValid(id)) targetDate = addDays(id, 30);
    if (targetDate < today) targetDate = today;
  }

  if (targetDate > endDate) return;
  const key = format(targetDate, 'yyyy-MM-dd');
  if (dailyMap[key] !== undefined) dailyMap[key] += amount;
}

function buildForecastData(invoiceRecords, receivables, billingBlocks, liveInvoices) {
  const today = startOfDay(new Date());
  const endDate = addDays(today, 30);
  const todayStr = format(today, 'yyyy-MM-dd');
  const endStr = format(endDate, 'yyyy-MM-dd');

  const dailyInvoices = {};
  const dailyReceivables = {};
  const dailyPlanned = {};
  const dailyLive = {};
  for (let i = 0; i <= 30; i++) {
    const d = format(addDays(today, i), 'yyyy-MM-dd');
    dailyInvoices[d] = 0;
    dailyReceivables[d] = 0;
    dailyPlanned[d] = 0;
    dailyLive[d] = 0;
  }

  // DB-Rechnungen (InvoiceRecord) — am Fälligkeitsdatum
  const openInvoices = invoiceRecords.filter(inv =>
    inv.payment_status !== 'paid' &&
    inv.payment_status !== 'cancelled' &&
    (Number(inv.open_amount) > 0 || Number(inv.gross_amount) > 0)
  );
  openInvoices.forEach(inv => pinToDaily(dailyInvoices, today, endDate, inv));

  // DB-Forderungen (Receivable) — am Fälligkeitsdatum
  const openReceivables = receivables.filter(r =>
    r.status !== 'paid' && r.status !== 'write_off' &&
    Number(r.gross_amount) > 0
  );
  openReceivables.forEach(r => pinToDaily(dailyReceivables, today, endDate, {
    gross_amount: r.gross_amount,
    open_amount: r.gross_amount,
    invoice_date: r.invoice_date,
    due_date: r.due_date,
  }));

  // Geplante Abrechnungen (BillingBlock) — noch nicht verrechnet
  const alreadyLinkedInvoices = new Set(invoiceRecords.map(i => i.billing_block_id).filter(Boolean));
  const plannedBlocks = (billingBlocks || []).filter(b =>
    b.invoice_readiness_status !== 'invoiced' &&
    b.invoice_readiness_status !== 'paid' &&
    !alreadyLinkedInvoices.has(b.id) &&
    Number(b.amount_gross || b.amount_net) > 0
  );
  plannedBlocks.forEach(b => {
    const amount = Number(b.amount_gross) || Number(b.amount_net) * 1.2;
    let dueDate = b.planned_invoice_date;
    if (!dueDate && b.billing_month) dueDate = `${b.billing_month}-15`;
    if (!dueDate || dueDate < todayStr || dueDate > endStr) return;
    if (dailyPlanned[dueDate] !== undefined) dailyPlanned[dueDate] += amount;
  });

  // Live sevDesk Rechnungen — dedupliziert
  const dbInvoiceNumbers = new Set(invoiceRecords.map(i => i.invoice_number).filter(Boolean));
  const dedupedLive = (liveInvoices || []).filter(inv => !dbInvoiceNumbers.has(inv.invoice_number));
  dedupedLive.forEach(inv => pinToDaily(dailyLive, today, endDate, inv));

  // 5-Tage-Buckets über 30 Tage
  const buckets = [];
  let i = 0;
  while (i <= 30) {
    const bucketStart = addDays(today, i);
    const bucketEnd = addDays(today, Math.min(i + 4, 30));
    let sumInvoices = 0, sumReceivables = 0, sumPlanned = 0, sumLive = 0;
    for (let d = new Date(bucketStart); d <= bucketEnd; d = addDays(d, 1)) {
      const key = format(d, 'yyyy-MM-dd');
      if (dailyInvoices[key]) sumInvoices += dailyInvoices[key];
      if (dailyReceivables[key]) sumReceivables += dailyReceivables[key];
      if (dailyPlanned[key]) sumPlanned += dailyPlanned[key];
      if (dailyLive[key]) sumLive += dailyLive[key];
    }
    buckets.push({
      label: format(bucketStart, 'dd.MM.', { locale: de }),
      invoices: Math.round(sumInvoices),
      receivables: Math.round(sumReceivables),
      planned: Math.round(sumPlanned),
      live: Math.round(sumLive),
      total: Math.round(sumInvoices + sumReceivables + sumPlanned + sumLive),
    });
    i += 5;
  }

  let cumulative = 0;
  return buckets.map(b => {
    cumulative += b.total;
    return { ...b, cumulative: Math.round(cumulative) };
  });
}

export default function CashflowForecastChart({ invoiceRecords = [], receivables = [], billingBlocks = [] }) {
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
    () => buildForecastData(invoiceRecords, receivables, billingBlocks, liveInvoices || []),
    [invoiceRecords, receivables, billingBlocks, liveInvoices]
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
            <CardTitle className="text-base font-semibold">Geldeingang-Forecast (30 Tage)</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Rechnungen + Forderungen · 5-Tage-Buckets · am Fälligkeitsdatum
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Gesamt 30 Tage</p>
              <p className="text-sm font-bold text-emerald-600">{formatCurrency(totalExpected)}</p>
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
                <linearGradient id="cfPlanned" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0} />
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
              <Area type="monotone" dataKey="planned" name="Geplante Abrechnung" stackId="1"
                stroke="hsl(199, 89%, 48%)" strokeWidth={1.5} fill="url(#cfPlanned)" />
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