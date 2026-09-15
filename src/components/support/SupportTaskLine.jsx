import React from 'react';
import { FilePlus2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const std = (min) => Math.round((min / 60) * 100) / 100;
const halb = (min) => Math.max(0.5, Math.ceil((Number(min) || 0) / 30) / 2);

// Ein Support-Ticket als eigener Vorgang — einzeln abrechenbar
export default function SupportTaskLine({ task, onInvoice }) {
  return (
    <div className="flex items-center gap-3 border rounded-lg px-3 py-2 bg-background">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{task.task_title}</p>
        <p className="text-xs text-muted-foreground truncate">
          {task.assignee_name || '—'} · letzte Buchung {task.last_entry_date || '—'} · gebucht {std(task.open_minutes).toFixed(2)} h · verrechnet {halb(task.open_minutes).toFixed(1)} h
        </p>
      </div>
      <Button size="sm" variant="outline" className="flex-shrink-0" onClick={() => onInvoice(task)}>
        <FilePlus2 className="w-3.5 h-3.5" /> Einzelrechnung
      </Button>
    </div>
  );
}