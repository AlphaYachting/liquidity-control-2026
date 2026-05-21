import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2 } from 'lucide-react';
import { formatCurrency, getMonthLabel } from '@/lib/liquidityUtils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const READINESS = {
  not_ready:   { label: 'Nicht bereit',    color: 'bg-gray-100 text-gray-600' },
  in_progress: { label: 'In Bearbeitung',  color: 'bg-blue-100 text-blue-700' },
  ready:       { label: 'Bereit',          color: 'bg-emerald-100 text-emerald-700' },
  invoiced:    { label: 'Verrechnet',      color: 'bg-purple-100 text-purple-700' },
  paid:        { label: 'Bezahlt',         color: 'bg-teal-100 text-teal-700' },
};

export default function BillingBlockList({ blocks, onEdit, onDelete, onStatusChange }) {
  if (!blocks.length) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-xl">
        Noch keine Abrechnungspakete. Paket hinzufügen →
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {blocks.map((block) => {
        const rl = READINESS[block.invoice_readiness_status] || READINESS.not_ready;
        return (
          <div key={block.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
            <div className="w-1.5 h-12 rounded-full bg-primary/30 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{block.title}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {block.billing_month && (
                  <span className="text-xs text-muted-foreground">{getMonthLabel(block.billing_month)}</span>
                )}
                {block.probability_percent < 100 && (
                  <span className="text-xs text-muted-foreground">{block.probability_percent}%</span>
                )}
                {block.responsible_person && (
                  <span className="text-xs text-muted-foreground">{block.responsible_person}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <p className="font-semibold text-sm w-24 text-right">{formatCurrency(block.amount_net)}</p>
              <Select value={block.invoice_readiness_status || 'not_ready'} onValueChange={v => onStatusChange(block.id, v)}>
                <SelectTrigger className="w-36 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(READINESS).map(([v, { label }]) => (
                    <SelectItem key={v} value={v} className="text-xs">{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(block)}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(block.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}