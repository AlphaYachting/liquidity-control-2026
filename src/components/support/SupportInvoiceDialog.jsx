import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

// Verrechnet wird nur in halben Stunden — je Support-Anfrage aufgerundet, Minimum 0,5 h
const halbeStunden = (min) => Math.max(0.5, Math.ceil((Number(min) || 0) / 30) / 2);

export default function SupportInvoiceDialog({ row, open, onOpenChange, onDone }) {
  const [rate, setRate] = useState(120);
  const [selected, setSelected] = useState(() => row.tasks.map(t => t.awork_task_id));
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');

  const gewaehlt = row.tasks.filter(t => selected.includes(t.awork_task_id));
  const positionen = gewaehlt.map(t => ({
    awork_task_id: t.awork_task_id,
    name: t.task_title,
    text: `Supportanfrage · erledigt ${t.last_entry_date || '—'}${t.assignee_name ? ` · ${t.assignee_name}` : ''}`,
    quantity: halbeStunden(t.open_minutes),
    price: Number(rate || 0),
  }));
  const stunden = positionen.reduce((s, p) => s + p.quantity, 0);
  const netto = Math.round(stunden * Number(rate || 0) * 100) / 100;

  const anlegen = async () => {
    setBusy(true);
    setFehler('');
    try {
      const instr = await base44.entities.BillingInstruction.create({
        // Support-Anfragen laufen oft ohne Projekt im Cockpit — dann bleibt das Feld leer
        project_id: row.liquidity_project_id || '',
        customer_name: row.customer_name,
        project_name: row.project_name,
        instruction_type: 'manual_amount',
        invoice_type: 'partial_invoice',
        status: 'ready_for_backoffice',
        instruction_amount_net: netto,
        invoice_reason: positionen.length === 1
          ? `Supportleistung: ${positionen[0].name} (${stunden.toFixed(1)} h)`
          : `Supportleistungen ${row.project_name} — ${positionen.length} Anfragen, ${stunden.toFixed(1)} h`,
        internal_note: `Support-Abrechnung aus awork (Status „In Verrechnung") — ${positionen.length} Positionen à ${rate} €/h, halbstundengenau`,
        source_snapshot_json: JSON.stringify({
          support_task_ids: positionen.map(p => p.awork_task_id),
          sevdesk_contact_id: row.sevdesk_contact_id || null,
          hourly_rate: Number(rate),
          hours: stunden,
          invoice_positions: positionen,
        }),
      });
      const res = await base44.functions.invoke('createSevdeskInvoiceDraft', {
        billing_instruction_id: instr.id,
        set_status_invoice_created: true,
      });
      if (res.data?.error) throw new Error(res.data.error);
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
            Jede Support-Anfrage geht als eigene Rechnungsposition heraus. Verrechnet wird in halben Stunden,
            je Anfrage aufgerundet (Minimum 0,5 h).
          </p>

          <div className="max-h-60 overflow-y-auto border rounded-lg divide-y">
            {row.tasks.map(t => (
              <label key={t.awork_task_id} className="flex items-center gap-3 text-sm px-3 py-2">
                <Checkbox
                  checked={selected.includes(t.awork_task_id)}
                  onCheckedChange={(c) => setSelected(s => c ? [...s, t.awork_task_id] : s.filter(x => x !== t.awork_task_id))}
                />
                <span className="flex-1 truncate">{t.task_title}</span>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  gebucht {(t.open_minutes / 60).toFixed(2)} h
                </span>
                <span className="text-xs font-medium flex-shrink-0 w-16 text-right">
                  {halbeStunden(t.open_minutes).toFixed(1)} h
                </span>
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
              <div className="h-9 flex items-center text-sm">{positionen.length} · {stunden.toFixed(1)} h</div>
            </div>
            <div>
              <Label className="text-xs">Rechnungsbetrag netto</Label>
              <div className="h-9 flex items-center font-semibold">
                {netto.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })}
              </div>
            </div>
          </div>

          {!row.liquidity_project_id && (
            <p className="text-xs text-muted-foreground">
              Ohne Projekt im Cockpit — die Rechnung geht direkt an den zugewiesenen sevDesk-Kunden.
            </p>
          )}
          {fehler && <p className="text-xs text-red-600">{fehler}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={anlegen} disabled={busy || netto <= 0 || !row.customer_name}>
            {busy ? 'Wird angelegt...' : 'Entwurf in sevDesk anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}