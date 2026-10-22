import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FilePlus2, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useZugriff } from '@/lib/useZugriff';
import SupportAppInvoiceDialog from '@/components/support/SupportAppInvoiceDialog';
import SupportAppLine from '@/components/support/SupportAppLine';
import SupportNichtVerrechnet from '@/components/support/SupportNichtVerrechnet';
import SupportNichtVerrechnenDialog from '@/components/support/SupportNichtVerrechnenDialog';
import SupportAworkZeitDialog from '@/components/support/SupportAworkZeitDialog';
import SevdeskVerknuepfenDialog from '@/components/support/SevdeskVerknuepfenDialog';
import SupportInstructionBadge from '@/components/support/SupportInstructionBadge';
import SupportZeitZuordnenDialog from '@/components/support/SupportZeitZuordnenDialog';

// Ein Kunde mit seinen erledigten App-Tickets — eine Rechnung, je Ticket eine Position
export default function SupportAppRow({ row, onDone }) {
  const { darf } = useZugriff();
  const darfAendern = darf('fuehrung');
  const [offen, setOffen] = useState(true);
  const [dialogTasks, setDialogTasks] = useState(null);
  const [nichtTask, setNichtTask] = useState(null);
  const [aworkTask, setAworkTask] = useState(null);
  const [sevdesk, setSevdesk] = useState(false);
  const [zuordnenTask, setZuordnenTask] = useState(null);
  const verknuepft = Boolean(row.sevdesk_contact_id);
  const regie = row.art === 'regie';
  // Kundenblock (22.10.2026): Support und Regie gemischt — Art und Projekt stehen an der Position
  const istRegieTask = (t) => (t.art ? t.art === 'regie' : regie);
  const gruppen = [];
  for (const t of row.tasks) {
    const name = t.projekt_name || row.project_name || '';
    let g = gruppen.find((x) => x.name === name);
    if (!g) { g = { name, regie: istRegieTask(t), satz: t.stundensatz || row.stundensatz, tasks: [] }; gruppen.push(g); }
    g.tasks.push(t);
  }
  const kopfProjekte = row.projekte?.length
    ? row.projekte.map((p) => `${p.name} · ${p.stundensatz} €/h`).join('  |  ')
    : `${row.project_name} · ${row.stundensatz} €/h`;
  // „ohne gebuchte Zeit“ zählt nicht mit, was bewusst als nicht verrechenbar gebucht wurde
  const ohneZeit = row.tasks.filter((t) => t.ohne_zeit && !(t.nicht_verrechenbar_minutes > 0)).length;
  const stunden = row.billable_minutes / 60;
  const vorbehalt = (row.vorbehalt_minutes || 0) / 60;

  return (
    <div className="border rounded-lg bg-card">
      <div className="flex items-start gap-3 p-4">
        <button onClick={() => setOffen((o) => !o)} className="mt-0.5 text-muted-foreground">
          {offen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{row.customer_name}</p>
          <p className="text-xs text-muted-foreground truncate">{kopfProjekte}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge className="bg-slate-100 text-slate-700">{row.tasks.length} Positionen</Badge>
            {stunden > 0 && <Badge className="bg-amber-100 text-amber-700">{stunden.toFixed(2)} h gebucht zu verrechnen</Badge>}
            {ohneZeit > 0 && <Badge className="bg-amber-100 text-amber-800">{ohneZeit} ohne gebuchte Zeit</Badge>}
            {vorbehalt > 0 && <Badge className="bg-amber-100 text-amber-800">{vorbehalt.toFixed(2)} h vor der Umstellung — mit aWork abgleichen</Badge>}
            {!verknuepft && (
              darfAendern && row.client_id ? (
                <button onClick={() => setSevdesk(true)}>
                  <Badge className="bg-red-100 text-red-700 gap-1 cursor-pointer"><Link2 className="w-3 h-3" /> Mit sevDesk verknüpfen</Badge>
                </button>
              ) : (
                <Badge className="bg-red-100 text-red-700">Kunde nicht mit sevDesk verknüpft</Badge>
              )
            )}
            {verknuepft && row.tasks.length > 0 && <Badge className="bg-red-100 text-red-700">Rechnung noch zu erstellen</Badge>}
            {row.instructions.map((i) => <SupportInstructionBadge key={i.id} instruction={i} onDone={onDone} />)}
          </div>
        </div>
        <Button size="sm" variant="outline" className="flex-shrink-0" onClick={() => setDialogTasks(row.tasks)} disabled={!verknuepft || row.tasks.length === 0}>
          <FilePlus2 className="w-3.5 h-3.5" /> Eine Rechnung
        </Button>
      </div>

      {offen && (
        <div className="border-t px-4 py-3 space-y-2">
          {gruppen.map((g) => (
            <div key={g.name} className="space-y-2">
              {gruppen.length > 1 && (
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pt-1">
                  {g.name} · {g.regie ? 'Regie' : 'Support'} · {g.satz} €/h
                </p>
              )}
              {g.tasks.map((t) => (
                <SupportAppLine
                  key={t.key}
                  task={t}
                  abrechenbar={verknuepft}
                  darfAendern={darfAendern}
                  onInvoice={(task) => setDialogTasks([task])}
                  onNichtVerrechnen={setNichtTask}
                  onAworkZeit={setAworkTask}
                  onZuordnen={setZuordnenTask}
                  regie={istRegieTask(t)}
                />
              ))}
            </div>
          ))}
          <SupportNichtVerrechnet tickets={row.nicht_verrechnet} darfAendern={darfAendern} onDone={onDone} />
        </div>
      )}

      {dialogTasks && (
        <SupportAppInvoiceDialog
          row={{ ...row, tasks: dialogTasks }}
          open={true}
          onOpenChange={(o) => { if (!o) setDialogTasks(null); }}
          onDone={onDone}
        />
      )}
      {nichtTask && (
        <SupportNichtVerrechnenDialog task={nichtTask} open={true} onOpenChange={(o) => { if (!o) setNichtTask(null); }} onDone={onDone} />
      )}
      {aworkTask && (
        <SupportAworkZeitDialog task={aworkTask} open={true} onOpenChange={(o) => { if (!o) setAworkTask(null); }} onDone={onDone} />
      )}
      {zuordnenTask && (
        <SupportZeitZuordnenDialog task={zuordnenTask} open={true} onOpenChange={(o) => { if (!o) setZuordnenTask(null); }} onDone={onDone} />
      )}
      {sevdesk && (
        <SevdeskVerknuepfenDialog clientId={row.client_id} kundenname={row.customer_name} open={true} onOpenChange={setSevdesk} onDone={onDone} />
      )}
    </div>
  );
}
