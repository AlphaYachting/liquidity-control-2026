import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarClock, Loader2 } from 'lucide-react';

// Verschiebt eine geplante Rechnung in einen anderen Monat — ohne Neueingabe.
export default function PlanMoveControl({ plan, monthOptions, getMonthLabel, onMove, isPending }) {
  const [open, setOpen] = useState(false);
  const [targetMonth, setTargetMonth] = useState('');
  const [reason, setReason] = useState('');
  const options = monthOptions.filter((m) => m !== plan.planning_month);

  if (!open) {
    return (
      <button
        title="In anderen Monat verschieben"
        onClick={() => { setOpen(true); setTargetMonth(options[0] || ''); setReason(''); }}
        className="p-1 rounded hover:bg-orange-50 text-muted-foreground hover:text-orange-600 transition-colors">
        <CalendarClock className="w-3 h-3" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap bg-orange-50/70 border border-orange-200 rounded-lg px-2 py-1">
      <Select value={targetMonth} onValueChange={setTargetMonth}>
        <SelectTrigger className="h-6 text-xs w-36 bg-white"><SelectValue placeholder="Ziel-Monat" /></SelectTrigger>
        <SelectContent>
          {options.map((m) => (
            <SelectItem key={m} value={m} className="text-xs">{getMonthLabel(m)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Verschiebungsgrund"
        className="h-6 text-xs w-44 bg-white" />
      <Button size="sm" className="h-6 text-xs px-2"
        disabled={isPending || !targetMonth}
        onClick={() => onMove(plan, targetMonth, reason, () => setOpen(false))}>
        {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Verschieben'}
      </Button>
      <button onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground px-1">✕</button>
    </div>
  );
}