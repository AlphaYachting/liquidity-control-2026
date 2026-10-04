import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, FilePlus2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import SupportInvoiceDialog from '@/components/support/SupportInvoiceDialog';
import SupportAppLine from '@/components/support/SupportAppLine';
import SupportOhneZeit from '@/components/support/SupportOhneZeit';
import SupportInstructionBadge from '@/components/support/SupportInstructionBadge';

// Ein Kunde mit seinen erledigten App-Tickets — eine Rechnung, je Ticket eine Position
export default function SupportAppRow({ row, onDone }) {
  const [offen, setOffen] = useState(true);
  const [dialogTasks, setDialogTasks] = useState(null);
  const verknuepft = Boolean(row.sevdesk_contact_id);
  const stunden = row.billable_minutes / 60;

  return (
    <div className="border rounded-lg bg-card">
      <div className="flex items-start gap-3 p-4">
        <button onClick={() => setOffen(o => !o)} className="mt-0.5 text-muted-foreground">
          {offen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{row.customer_name}</p>
          <p className="text-xs text-muted-foreground truncate">{row.project_name} · {row.stundensatz} €/h</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge className="bg-slate-100 text-slate-700">{row.tasks.length} Positionen</Badge>
            {row.tasks.length > 0 && <Badge className="bg-amber-100 text-amber-700">{stunden.toFixed(2)} h zu verrechnen</Badge>}
            {!verknuepft && (
              <Link to="/sprint/projekte?tab=kunden">
                <Badge className="bg-red-100 text-red-700">Kunde nicht mit sevDesk verknüpft</Badge>
              </Link>
            )}
            {verknuepft && row.tasks.length > 0 && <Badge className="bg-red-100 text-red-700">Rechnung noch zu erstellen</Badge>}
            {row.instructions.map(i => <SupportInstructionBadge key={i.id} instruction={i} onDone={onDone} />)}
          </div>
        </div>
        <Button size="sm" variant="outline" className="flex-shrink-0" onClick={() => setDialogTasks(row.tasks)} disabled={!verknuepft || row.tasks.length === 0}>
          <FilePlus2 className="w-3.5 h-3.5" /> Eine Rechnung
        </Button>
      </div>

      {offen && (
        <div className="border-t px-4 py-3 space-y-2">
          {row.tasks.map(t => (
            <SupportAppLine key={t.key} task={t} abrechenbar={verknuepft} onInvoice={(task) => setDialogTasks([task])} />
          ))}
          <SupportOhneZeit tickets={row.ohne_zeit} />
        </div>
      )}

      {dialogTasks && (
        <SupportInvoiceDialog
          row={{ ...row, tasks: dialogTasks }}
          open={true}
          onOpenChange={(o) => { if (!o) setDialogTasks(null); }}
          onDone={onDone}
        />
      )}
    </div>
  );
}