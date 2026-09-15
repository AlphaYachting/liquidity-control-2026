import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FilePlus2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import SupportInvoiceDialog from '@/components/support/SupportInvoiceDialog';
import SupportTaskLine from '@/components/support/SupportTaskLine';
import CustomerAssignDialog from '@/components/support/CustomerAssignDialog';
import SupportInstructionBadge from '@/components/support/SupportInstructionBadge';

const halb = (min) => Math.max(0.5, Math.ceil((Number(min) || 0) / 30) / 2);

export default function SupportBillingRow({ row, onDone }) {
  const [offen, setOffen] = useState(true);
  const [dialog, setDialog] = useState(false);
  // Ein einzelnes Ticket abrechnen: dieselbe Maske, nur mit diesem einen Vorgang
  const [einzelTask, setEinzelTask] = useState(null);
  // Kundenzuweisung — entweder für die ganze Gruppe oder für eine Anfrage
  const [zuweisung, setZuweisung] = useState(null);

  const zugewiesen = Boolean(row.customer_name);
  const stunden = row.tasks.reduce((s, t) => s + halb(t.open_minutes), 0);

  return (
    <div className="border rounded-lg bg-card">
      <div className="flex items-start gap-3 p-4">
        <button onClick={() => setOffen(o => !o)} className="mt-0.5 text-muted-foreground">
          {offen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{row.customer_name || '— Kunde noch nicht zugewiesen —'}</p>
          <p className="text-xs text-muted-foreground truncate">{row.project_name}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge className="bg-slate-100 text-slate-700">{row.tasks.length} Anfragen in Verrechnung</Badge>
            <Badge className="bg-amber-100 text-amber-700">{stunden.toFixed(1)} h zu verrechnen</Badge>
            {!zugewiesen && <Badge className="bg-red-100 text-red-700">Kunde zuweisen</Badge>}
            {zugewiesen && row.instructions.length === 0 && (
              <Badge className="bg-red-100 text-red-700">Rechnung noch zu erstellen</Badge>
            )}
            {row.instructions.map(i => (
              <SupportInstructionBadge key={i.id} instruction={i} onDone={onDone} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 flex-shrink-0">
          <Button size="sm" variant={zugewiesen ? 'ghost' : 'default'} onClick={() => setZuweisung(row.tasks)}>
            <UserPlus className="w-3.5 h-3.5" /> {zugewiesen ? 'Kunde ändern' : 'Kunde zuweisen'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDialog(true)} disabled={!zugewiesen}>
            <FilePlus2 className="w-3.5 h-3.5" /> Eine Rechnung
          </Button>
        </div>
      </div>

      {offen && (
        <div className="border-t px-4 py-3 space-y-2">
          {row.tasks.map(t => (
            <SupportTaskLine
              key={t.awork_task_id}
              task={t}
              kundeZugewiesen={zugewiesen}
              onInvoice={setEinzelTask}
              onAssign={(task) => setZuweisung([task])}
            />
          ))}
        </div>
      )}

      {dialog && (
        <SupportInvoiceDialog row={row} open={dialog} onOpenChange={setDialog} onDone={onDone} />
      )}

      {einzelTask && (
        <SupportInvoiceDialog
          row={{ ...row, tasks: [einzelTask] }}
          open={true}
          onOpenChange={(o) => { if (!o) setEinzelTask(null); }}
          onDone={onDone}
        />
      )}

      {zuweisung && (
        <CustomerAssignDialog
          tasks={zuweisung}
          vorschlag={zuweisung.length === 1 ? (zuweisung[0].suggested_customer || row.customer_name) : row.customer_name}
          open={true}
          onOpenChange={(o) => { if (!o) setZuweisung(null); }}
          onDone={onDone}
        />
      )}
    </div>
  );
}