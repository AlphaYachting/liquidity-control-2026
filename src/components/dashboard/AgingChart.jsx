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

export default function AgingChart({ receivables, invoiceRecords = [] }) {

  const buckets = { not_due: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };

  // Manuelle Forderungen (Receivable entity)
  receivables.filter(r => r.status !== 'paid' && r.status !== 'write_off').forEach(r => {
    const days = calcOverdueDays(r.due_date);
    const bucket = getAgingBucket(days);
    buckets[bucket] += Number(r.gross_amount) || 0;
  });

  // Bereits gematchte Rechnungsnummern aus Receivables → nicht doppelt zählen
  const receivableNrs = new Set(receivables.map(r => r.invoice_number).filter(Boolean).map(n => n.toLowerCase()));

  // InvoiceRecords (sevDesk-Rechnungen) — noch offene, nicht stornierte, keine Entwürfe
  invoiceRecords
    .filter(i => i.payment_status !== 'paid' && i.payment_status !== 'cancelled' && i.payment_status !== 'draft' && !i.is_credit_note)
    .filter(i => !i.invoice_number || !receivableNrs.has(i.invoice_number.toLowerCase()))
    .forEach(i => {
      const dueDate = i.due_date || i.invoice_date;
      const days = calcOverdueDays(dueDate);
      const bucket = getAgingBucket(days);
      const amount = Number(i.open_amount) > 0 ? Number(i.open_amount) : Number(i.gross_amount) || 0;
      buckets[bucket] += amount;
    });

  const total = Object.values(buckets).reduce((s, v) => s + v, 0);
  const data = Object.entries(buckets).map(([key, value]) => ({
    name: AGING_LABELS[key],
    value,
    pct: total > 0 ? Math.round(value / total * 100) : 0,
    fill: BUCKET_COLORS[key]
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Forderungen Altersstruktur</CardTitle>
        <p className="text-xs text-muted-foreground">Receivables + InvoiceRecords (brutto, offen) · Gesamt: {formatCurrency(total)}</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={(v, name, props) => [`${formatCurrency(v)} (${props.payload.pct}%)`, 'Betrag']} />
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