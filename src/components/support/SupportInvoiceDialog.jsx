import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

const std = (min) => Math.round((min / 60) * 100) / 100;

export default function SupportInvoiceDialog({ row, open, onOpenChange, onDone }) {
  const [rate, setRate] = useState(120);
  const [selected, setSelected] = useState(() => row.tasks.map(t => t.awork_task_id));
  const [grund, setGrund] = useState('');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');

  const gewaehlt = row.tasks.filter(t => selected.includes(t.awork_task_id));
  const minuten = gewaehlt.reduce((s, t) => s + t.open_minutes, 0);
  const netto = Math.round(std(minuten) * Number(rate || 0) * 100) / 100;

  const standardGrund = `Supportleistungen ${row.project_name}:\n` +
    gewaehlt.map(t => `- ${t.task_title} (${std(t.open_minutes).toFixed(2)} h)`).join('\n');

  const anlegen = async () => {
    setBusy(true);
    setFehler('');
    try {
      const instr = await base44.entities.BillingInstruction.create({
        project_id: row.liquidity_project_id,
        customer_name: row.customer_name,
        project_name: row.project_name,
        instruction_type: 'manual_amount',
        invoice_type: 'partial_invoice',
        status: 'ready_for_backoffice',
        instruction_amount_net: netto,
        invoice_reason: (grund || standardGrund).trim(),
        internal_note: `Support-Abrechnung aus awork — ${gewaehlt.length} Aufgaben, ${std(minuten).toFixed(2)} h à ${rate} €`,
        source_snapshot_json: JSON.stringify({ support_task_ids: gewaehlt.map(t => t.awork_task_id), hourly_rate: Number(rate), minutes: minuten }),
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Rechnung anlegen — {row.customer_name || row.project_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="max-h-52 overflow-y-auto space-y-2 border rounded-lg p-3">
            {row.tasks.map(t => (
              <label key={t.awork_task_id} className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={selected.includes(t.awork_task_id)}
                  onCheckedChange={(c) => setSelected(s => c ? [...s, t.awork_task_id] : s.filter(x => x !== t.awork_task_id))}
                />
                <span className="flex-1">
                  {t.task_title}
                  <span className="text-muted-foreground"> · {std(t.open_minutes).toFixed(2)} h</span>
                </span>
              </label>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Stundensatz netto</Label>
              <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Rechnungsbetrag netto</Label>
              <div className="h-9 flex items-center font-semibold">
                {netto.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })}
                <span className="ml-2 text-xs font-normal text-muted-foreground">{std(minuten).toFixed(2)} h</span>
              </div>
            </div>
          </div>

          <div>
            <Label className="text-xs">Rechnungsgrund / Positionstext</Label>
            <Textarea rows={5} value={grund || standardGrund} onChange={(e) => setGrund(e.target.value)} />
          </div>

          {!row.liquidity_project_id && (
            <p className="text-xs text-amber-700">
              Dieses awork-Projekt ist noch keinem Projekt im Cockpit zugeordnet — bitte zuerst verknüpfen.
            </p>
          )}
          {fehler && <p className="text-xs text-red-600">{fehler}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={anlegen} disabled={busy || netto <= 0 || !row.liquidity_project_id}>
            {busy ? 'Wird angelegt...' : 'Entwurf in sevDesk anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}