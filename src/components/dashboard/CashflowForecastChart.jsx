import React, { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { formatCurrency } from '@/lib/liquidityUtils';
import { addDays, format, parseISO, isValid, startOfDay, isBefore } from 'date-fns';
import { de } from 'date-fns/locale';
import { RefreshCw, Zap } from 'lucide-react';
import { base44 } from '@/api/base44Client';

function buildForecastData(invoiceRecords, billingBlocks, liveInvoices) {
  const today = startOfDay(new Date());
  const endDate = addDays(today, 30);
  const todayStr = format(today, 'yyyy-MM-dd');
  const endStr = format(endDate, 'yyyy-MM-dd');

  // Tagesmap aufbauen
  const dailyMap = {};
  for (let i = 0; i <= 30; i++) {
    const d = format(addDays(today, i), 'yyyy-MM-dd');
    dailyMap[d] = { invoices: 0, planned: 0, live: 0, overdue: 0 };
  }

  // DB-Rechnungen: offen/überfällig — am Fälligkeitsdatum (nur wenn vorhanden)
  const openInvoices = invoiceRecords.filter(inv =>
    inv.payment_status !== 'paid' &&
    inv.payment_status !== 'cancelled' &&
    inv.payment_status !== 'draft' &&
    !inv.is_credit_note &&
    inv.due_date && // Rechnungen ohne Fälligkeitsdatum ignorieren
    (Number(inv.open_amount) > 0 || Number(inv.gross_amount) > 0)
  );
  openInvoices.forEach(inv => {
    const amount = Number(inv.open_amount) > 0 ? Number(inv.open_amount) : Number(inv.gross_amount);
    if (!amount) return;
    const dd = parseISO(inv.due_date);
    if (!isValid(dd)) return;
    const isOverdue = isBefore(dd, today);
    const key = isOverdue ? todayStr : format(dd, 'yyyy-MM-dd');
    if (key > endStr) return; // außerhalb 30 Tage
    if (dailyMap[key]) {
      isOverdue ? (dailyMap[key].overdue += amount) : (dailyMap[key].invoices += amount);
    }
  });

  // Geplante Abrechnungen (BillingBlock)
  const alreadyLinked = new Set(invoiceRecords.map(i => i.billing_block_id).filter(Boolean));
  (billingBlocks || []).filter(b =>
    b.invoice_readiness_status !== 'invoiced' &&
    b.invoice_readiness_status !== 'paid' &&
    !alreadyLinked.has(b.id) &&
    Number(b.amount_gross || b.amount_net) > 0
  ).forEach(b => {
    const amount = Number(b.amount_gross) || Number(b.amount_net) * 1.2;
    let key = b.planned_invoice_date || (b.billing_month ? `${b.billing_month}-15` : null);
    if (!key || key < todayStr || key > endStr) return;
    if (dailyMap[key]) dailyMap[key].planned += amount;
  });

  // Live sevDesk — dedupliziert
  const dbNrs = new Set(invoiceRecords.map(i => i.invoice_number).filter(Boolean));
  (liveInvoices || []).filter(inv => !dbNrs.has(inv.invoice_number)).forEach(inv => {
    const amount = Number(inv.open_amount) > 0 ? Number(inv.open_amount) : Number(inv.gross_amount);
    if (!amount) return;
    let key = todayStr;
    if (inv.due_date) {
      const dd = parseISO(inv.due_date);
      if (isValid(dd)) {
        key = isBefore(dd, today) ? todayStr : format(dd, 'yyyy-MM-dd');
        if (key > endStr) return;
      }
    }
    if (dailyMap[key]) dailyMap[key].live += amount;
  });

  // Täglich → Array, nur Tage mit Wert oder jeden 3. Tag als Achsenbeschriftung
  return Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      label: format(parseISO(date), 'dd.MM.', { locale: de }),
      invoices: Math.round(v.invoices),
      overdue: Math.round(v.overdue),
      planned: Math.round(v.planned),
      live: Math.round(v.live),
      total: Math.round(v.invoices + v.overdue + v.planned + v.live),
    }));
}

export default function CashflowForecastChart({ invoiceRecords = [], billingBlocks = [] }) {
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
    () => buildForecastData(invoiceRecords, billingBlocks, liveInvoices || []),
    [invoiceRecords, billingBlocks, liveInvoices]
  );

  const totalOpen = data.reduce((s, d) => s + d.invoices + d.overdue, 0);
  const hasData = data.some(d => d.total > 0);

  // Nur jeden 5. Tag als Achsenbeschriftung zeigen
  const tickFormatter = (label, index) => index % 5 === 0 ? label : '';

  const customTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const row = data.find(d => d.label === label);
    if (!row || row.total === 0) return null;
    return (
      <div className="bg-card border rounded-lg p-3 shadow-lg text-xs space-y-1 min-w-[160px]">
        <p className="font-semibold">{row.date} (fällig)</p>
        {row.overdue > 0 && <p className="text-red-600">Überfällig: {formatCurrency(row.overdue)}</p>}
        {row.invoices > 0 && <p className="text-emerald-600">Offen: {formatCurrency(row.invoices)}</p>}
        {row.planned > 0 && <p className="text-sky-600">Geplant: {formatCurrency(row.planned)}</p>}
        {row.live > 0 && <p className="text-violet-600">Live sevDesk: {formatCurrency(row.live)}</p>}
        <p className="font-semibold border-t pt-1">Gesamt: {formatCurrency(row.total)}</p>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base font-semibold">Offene Rechnungen nach Fälligkeitsdatum (30 Tage)</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tagesgenau · nur Rechnungen aus DB · überfällige werden heute gezeigt
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Offen (30 Tage)</p>
              <p className="text-sm font-bold text-emerald-600">{formatCurrency(totalOpen)}</p>
            </div>
            <Button size="sm" variant="outline" className="text-xs h-8 gap-1" onClick={handleFetchLive} disabled={loadingLive}>
              {loadingLive ? <><RefreshCw className="w-3 h-3 animate-spin" /> Lade…</> : <><Zap className="w-3 h-3" /> Live sevDesk</>}
            </Button>
          </div>
        </div>
        {liveInvoices !== null && (
          <Badge className="bg-amber-100 text-amber-800 text-xs mt-1 w-fit">+{liveInvoices.length} live (dedupliziert)</Badge>
        )}
        {liveError && <p className="text-xs text-red-600 mt-1">Fehler: {liveError}</p>}
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
            Keine offenen Rechnungen in den nächsten 30 Tagen.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }} barSize={6}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} tickFormatter={tickFormatter} interval={0} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={customTooltip} />
              <ReferenceLine x={data[0]?.label} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 2" label={{ value: 'Heute', fontSize: 9, position: 'top' }} />
              <Bar dataKey="overdue" name="Überfällig" stackId="a" fill="hsl(0, 84%, 60%)" />
              <Bar dataKey="invoices" name="Fällig" stackId="a" fill="hsl(142, 71%, 45%)" />
              <Bar dataKey="planned" name="Geplant" stackId="a" fill="hsl(199, 89%, 48%)" />
              {liveInvoices !== null && (
                <Bar dataKey="live" name="Live sevDesk" stackId="a" fill="hsl(262, 83%, 58%)" />
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}