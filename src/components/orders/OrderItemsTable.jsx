import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/liquidityUtils';

const STATUS_LABELS = {
  not_started: { label: 'Nicht begonnen', color: 'bg-gray-100 text-gray-500' },
  in_progress: { label: 'In Arbeit', color: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Fertig', color: 'bg-emerald-100 text-emerald-700' },
  blocked: { label: 'Blockiert', color: 'bg-red-100 text-red-700' },
};

export default function OrderItemsTable({ items = [] }) {
  if (items.length === 0) return null;

  const sorted = [...items].sort((a, b) => (a.position || 0) - (b.position || 0));
  const regularItems = sorted.filter(i => !i.is_discount);
  const discounts = sorted.filter(i => i.is_discount);
  const sumPositions = regularItems.reduce((s, i) => s + (i.total_price || 0), 0);
  const totalDiscount = discounts.reduce((s, i) => s + (i.total_price || 0), 0);
  const totalNet = sumPositions + totalDiscount;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Leistungsübersicht — Positionen ({regularItems.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium w-8">Pos.</th>
              <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Beschreibung</th>
              <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium w-28">Einzelpreis</th>
              <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium w-28">Gesamtpreis</th>
              <th className="text-center px-4 py-2 text-xs text-muted-foreground font-medium w-28">Status</th>
            </tr>
          </thead>
          <tbody>
            {regularItems.map(item => {
              const s = STATUS_LABELS[item.status] || STATUS_LABELS.not_started;
              return (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-2.5 text-muted-foreground">{item.position}.</td>
                  <td className="px-4 py-2.5 font-medium">{item.title}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{formatCurrency(item.unit_price)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(item.total_price)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>
                      {s.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/10">
              <td colSpan={3} className="px-4 py-2 text-sm text-muted-foreground text-right">Summe Positionen netto</td>
              <td className="px-4 py-2 text-right font-semibold">{formatCurrency(sumPositions)}</td>
              <td />
            </tr>
            {discounts.map(d => (
              <tr key={d.id} className="border-t">
                <td colSpan={3} className="px-4 py-2 text-sm text-amber-700 text-right">{d.title}</td>
                <td className="px-4 py-2 text-right font-semibold text-amber-700">{formatCurrency(d.total_price)}</td>
                <td />
              </tr>
            ))}
            <tr className="border-t bg-primary/5">
              <td colSpan={3} className="px-4 py-2.5 text-sm font-bold text-right">Gesamtbetrag netto</td>
              <td className="px-4 py-2.5 text-right font-bold text-base">{formatCurrency(totalNet)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </CardContent>
    </Card>
  );
}