import React, { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, FilePlus2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import SupportInvoiceDialog from '@/components/support/SupportInvoiceDialog';
import SupportTaskLine from '@/components/support/SupportTaskLine';

const halb = (min) => Math.max(0.5, Math.ceil((Number(min) || 0) / 30) / 2);

export default function SupportBillingRow({ row, onDone }) {
  const [offen, setOffen] = useState(true);
  const [dialog, setDialog] = useState(false);
  // Ein einzelnes Ticket abrechnen: dieselbe Maske, nur mit diesem einen Vorgang
  const [einzelTask, setEinzelTask] = useState(null);

  return (
    <div className="border rounded-lg bg-card">
      <div className="flex items-start gap-3 p-4">
        <button onClick={() => setOffen(o => !o)} className="mt-0.5 text-muted-foreground">
          {offen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{row.customer_name || '— kein Kunde verknüpft —'}</p>
          <p className="text-xs text-muted-foreground truncate">{row.project_name}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge className="bg-slate-100 text-slate-700">{row.tasks.length} Anfragen in Verrechnung</Badge>
            <Badge className="bg-amber-100 text-amber-700">
              {(row.tasks.reduce((s, t) => s + halb(t.open_minutes), 0)).toFixed(1)} h zu verrechnen
            </Badge>
            {row.instructions.length === 0 ? (
              <Badge className="bg-red-100 text-red-700">Rechnung noch zu erstellen</Badge>
            ) : (
              row.instructions.map(i => (
                <span key={i.id} className="flex items-center gap-1">
                  <Badge className={i.live_status?.status_code === '1000' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}>
                    {i.live_status
                      ? `${i.live_status.invoice_number || 'Entwurf'} — ${i.live_status.status_label}`
                      : 'Anweisung ohne sevDesk-Rechnung'}
                  </Badge>
                  {i.sevdesk_invoice_url && (
                    <a href={i.sevdesk_invoice_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </span>
              ))
            )}
          </div>
        </div>

        <Button size="sm" variant="outline" onClick={() => setDialog(true)}>
          <FilePlus2 className="w-3.5 h-3.5" /> Sammelrechnung
        </Button>
      </div>

      {offen && (
        <div className="border-t px-4 py-3 space-y-2">
          {row.tasks.map(t => (
            <SupportTaskLine key={t.awork_task_id} task={t} onInvoice={setEinzelTask} />
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
    </div>
  );
}