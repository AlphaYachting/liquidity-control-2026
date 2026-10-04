import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { supportVerrechnungsMinuten } from '@/lib/zeit/rundung';

const stunden = (min) => supportVerrechnungsMinuten(min) / 60;

// Je Ticket eine Rechnungsposition — Minimum 0,5 h, danach in 15-Minuten-Schritten aufgerundet
export default function SupportInvoiceDialog({ row, open, onOpenChange, onDone }) {
  const istApp = row.quelle === 'app';
  const [rate, setRate] = useState(row.stundensatz || 130);
  const [selected, setSelected] = useState(() => row.tasks.map(t => t.key));
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');

  const gewaehlt = row.tasks.filter(t => selected.includes(t.key));
  const positionen = gewaehlt.map(t => ({
    key: t.key,
    name: t.task_title,
    text: `Supportauftrag · geleistet am ${t.last_entry_date ? new Date(t.last_entry_date).toLocaleDateString('de-AT') : '—'}${t.assignee_name ? ` · ${t.assignee_name}` : ''}`,
    quantity: stunden(t.open_minutes),
    price: Number(rate || 0),
  }));
  const summeStunden = positionen.reduce((s, p) => s + p.quantity, 0);
  const netto = Math.round(summeStunden * Number(rate || 0) * 100) / 100;
  const kundeOk = istApp ? Boolean(row.sevdesk_contact_id) : Boolean(row.customer_name);

  const anlegen = async () => {
    setBusy(true);
    setFehler('');
    try {
      const header = positionen.length === 1
        ? `Verrechnung Supportauftrag: ${positionen[0].name}`
        : `Verrechnung Supportauftrag: ${positionen.map(p => p.name).join(', ')}`;
      const quelleDaten = istApp
        ? {
            quelle: 'app',
            client_id: row.client_id,
            project_id: row.tasks[0]?.project_id || null,
            support_ticket_ids: gewaehlt.filter(t => t.ticket_id).map(t => t.ticket_id),
            time_entry_ids: gewaehlt.flatMap(t => t.time_entry_ids || []),
            vorleistung_ticket_ids: gewaehlt.filter(t => t.vorleistung_minutes > 0).map(t => t.ticket_id),
          }
        : { support_task_ids: gewaehlt.map(t => t.awork_task_id) };
      const instr = await base44.entities.BillingInstruction.create({
        project_id: row.liquidity_project_id || '',
        customer_name: row.customer_name,
        project_name: row.project_name,
        instruction_type: 'manual_amount',
        invoice_type: 'partial_invoice',
        status: 'ready_for_backoffice',
        instruction_amount_net: netto,
        invoice_reason: positionen.length === 1
          ? `Verrechnung Supportauftrag: ${positionen[0].name} (${summeStunden.toFixed(2)} h)`
          : `Verrechnung Supportauftrag — ${positionen.length} Anfragen, ${summeStunden.toFixed(2)} h`,
        internal_note: istApp
          ? `Support-Abrechnung aus Agency-Manager-Tickets (Status erledigt) — ${positionen.length} Positionen à ${rate} €/h, Minimum 0,5 h, danach in 15-Minuten-Schritten aufgerundet`
          : `Support-Abrechnung aus awork (Status „In Verrechnung") — ${positionen.length} Positionen à ${rate} €/h, Minimum 0,5 h, danach in 15-Minuten-Schritten aufgerundet`,
        source_snapshot_json: JSON.stringify({
          ...quelleDaten,
          sevdesk_contact_id: row.sevdesk_contact_id || null,
          invoice_header: header,
          hourly_rate: Number(rate),
          hours: summeStunden,
          invoice_positions: positionen,
        }),
      });
      const res = await base44.functions.invoke('createSevdeskInvoiceDraft', {
        billing_instruction_id: instr.id,
        set_status_invoice_created: true,
      });
      if (res.data?.error) throw new Error(res.data.error);
      if (istApp) {
        const mark = await base44.functions.invoke('supportAbrechnungMarkieren', { aktion: 'markieren', billing_instruction_id: instr.id });
        if (mark.data?.error) throw new Error(mark.data.error);
      }
      onDone();
      onOpenChange(false);
    } catch (e) {
      setFehler(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Rechnung anlegen — {row.customer_name || row.project_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Jedes Ticket geht als eigene Rechnungsposition heraus. Verrechnet wird je Ticket: Minimum 0,5 h,
            danach in 15-Minuten-Schritten aufgerundet.
          </p>

          <div className="max-h-60 overflow-y-auto border rounded-lg divide-y">
            {row.tasks.map(t => (
              <label key={t.key} className="flex items-center gap-3 text-sm px-3 py-2">
                <Checkbox
                  checked={selected.includes(t.key)}
                  onCheckedChange={(c) => setSelected(s => c ? [...s, t.key] : s.filter(x => x !== t.key))}
                />
                <span className="flex-1 min-w-0 truncate">{t.task_title}</span>
                <span className="text-xs font-medium flex-shrink-0 w-16 text-right">{stunden(t.open_minutes).toFixed(2)} h</span>
              </label>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Stundensatz netto</Label>
              <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Positionen / Stunden</Label>
              <div className="h-9 flex items-center text-sm">{positionen.length} · {summeStunden.toFixed(2)} h</div>
            </div>
            <div>
              <Label className="text-xs">Rechnungsbetrag netto</Label>
              <div className="h-9 flex items-center font-semibold">
                {netto.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })}
              </div>
            </div>
          </div>

          {!kundeOk && istApp && <p className="text-xs text-red-600">Kunde nicht mit sevDesk verknüpft.</p>}
          {fehler && <p className="text-xs text-red-600">{fehler}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={anlegen} disabled={busy || netto <= 0 || !kundeOk}>
            {busy ? 'Wird angelegt...' : 'Entwurf in sevDesk anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}