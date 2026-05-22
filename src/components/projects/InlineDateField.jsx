import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { CalendarDays, Check, X } from 'lucide-react';

/**
 * Inline-editierbares Datum-Feld für Abrechnungspakete.
 * Zeigt das geplante Rechnungsdatum an; Klick öffnet ein Datumfeld.
 */
export default function InlineDateField({ block, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(block.planned_invoice_date || '');

  const save = () => {
    onSave(val);
    setEditing(false);
  };

  const cancel = () => {
    setVal(block.planned_invoice_date || '');
    setEditing(false);
  };

  if (editing) return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <Input
        type="date"
        value={val}
        onChange={e => setVal(e.target.value)}
        className="h-5 text-xs px-1 py-0 border-primary w-32"
        autoFocus
        onKeyDown={e => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') cancel();
        }}
      />
      <button onClick={save} className="text-emerald-600 hover:text-emerald-700 p-0.5">
        <Check className="w-3 h-3" />
      </button>
      <button onClick={cancel} className="text-muted-foreground hover:text-foreground p-0.5">
        <X className="w-3 h-3" />
      </button>
    </div>
  );

  const isOverdue = block.planned_invoice_date
    && !['invoiced', 'paid'].includes(block.invoice_readiness_status)
    && new Date(block.planned_invoice_date) < new Date();

  return (
    <button
      onClick={e => { e.stopPropagation(); setEditing(true); }}
      className={`flex items-center gap-1 text-xs px-1 rounded transition-colors hover:bg-muted/60
        ${block.planned_invoice_date
          ? isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'
          : 'text-amber-500 italic'
        }`}
      title="Geplantes Rechnungsdatum — klicken zum Ändern"
    >
      <CalendarDays className="w-3 h-3 flex-shrink-0" />
      <span>{block.planned_invoice_date || 'Datum setzen'}</span>
    </button>
  );
}