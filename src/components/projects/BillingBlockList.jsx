import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pencil, Trash2, CalendarDays, Check } from 'lucide-react';
import { formatCurrency, getMonthLabel } from '@/lib/liquidityUtils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const READINESS = {
  not_ready:   { label: 'Nicht bereit',    color: 'bg-gray-100 text-gray-600' },
  in_progress: { label: 'In Bearbeitung',  color: 'bg-blue-100 text-blue-700' },
  ready:       { label: 'Bereit',          color: 'bg-emerald-100 text-emerald-700' },
  invoiced:    { label: 'Verrechnet',      color: 'bg-purple-100 text-purple-700' },
  paid:        { label: 'Bezahlt',         color: 'bg-teal-100 text-teal-700' },
};

// Generate month options for current year ± 1
const MONTH_OPTIONS = (() => {
  const options = [];
  for (let y = 2025; y <= 2027; y++) {
    for (let m = 1; m <= 12; m++) {
      const val = `${y}-${String(m).padStart(2, '0')}`;
      const label = new Date(y, m - 1, 1).toLocaleString('de-AT', { month: 'short', year: '2-digit' });
      options.push({ val, label });
    }
  }
  return options;
})();

function InlineDateEditor({ block, onDateChange }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(block.planned_invoice_date || '');

  const save = () => {
    onDateChange && onDateChange(block.id, val);
    setEditing(false);
  };

  if (editing) return (
    <div className="flex items-center gap-1">
      <Input type="date" value={val} onChange={e => setVal(e.target.value)}
        className="h-5 text-xs px-1 py-0 border-primary w-32" autoFocus
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }} />
      <button onClick={save} className="text-emerald-600 hover:text-emerald-700"><Check className="w-3 h-3" /></button>
    </div>
  );

  return (
    <button onClick={() => setEditing(true)}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 px-1 rounded transition-colors">
      <CalendarDays className="w-3 h-3" />
      <span className={block.planned_invoice_date ? '' : 'italic opacity-60'}>
        {block.planned_invoice_date || 'Datum setzen'}
      </span>
    </button>
  );
}

export default function BillingBlockList({ blocks, onEdit, onDelete, onStatusChange, onMonthChange, onDateChange }) {
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
                <Select value={block.billing_month || ''} onValueChange={v => onMonthChange && onMonthChange(block.id, v)}>
                  <SelectTrigger className="h-5 text-xs border-0 px-1 py-0 bg-transparent text-muted-foreground hover:bg-muted/50 w-auto gap-0.5 shadow-none">
                    <SelectValue placeholder="Monat wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_OPTIONS.map(({ val, label }) => (
                      <SelectItem key={val} value={val} className="text-xs">{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground/40 text-xs">·</span>
                <InlineDateEditor block={block} onDateChange={onDateChange} />
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