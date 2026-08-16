import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

// Erfasst die in sevDesk ausgestellte Rechnung und verbucht sie gegen die Anweisung.
// Die App legt in sevDesk nichts an — sie gleicht nur ab.
export default function RecordSevdeskInvoiceDialog({ instruction, open, onClose, onRecorded }) {
  const [number, setNumber] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [net, setNet] = useState('');
  const [saving, setSaving] = useState(false);

  if (!instruction) return null;

  const netValue = net === '' ? Number(instruction.instruction_amount_net) || 0 : Number(net) || 0;
  const vatRate = Number(instruction.vat_rate) || 20;
  const gross = Math.round(netValue * (1 + vatRate / 100) * 100) / 100;

  const speichern = async () => {
    if (!number.trim()) { toast.error('Rechnungsnummer aus sevDesk fehlt'); return; }
    setSaving(true);
    try {
      const record = await base44.entities.InvoiceRecord.create({
        invoice_number: number.trim(),
        invoice_date: date,
        customer_name: instruction.customer_name || '—',
        project_id: instruction.project_id || '',
        confirmed_order_id: instruction.confirmed_order_id || '',
        invoice_type: 'advance_invoice',
        net_amount: netValue,
        gross_amount: gross,
        vat_amount: Math.round((gross - netValue) * 100) / 100,
        vat_rate: vatRate,
        payment_status: 'open',
        open_amount: gross,
        is_sent: true,
        source_type: 'sevdesk',
        match_status: 'manually_matched',
        match_notes: 'Anzahlungsrechnung gegen Abrechnungsanweisung erfasst',
      });
      await onRecorded(record);
      toast.success('Anzahlungsrechnung erfasst — Anweisung gestellt');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>sevDesk-Anzahlungsrechnung erfassen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Rechnungsnummer (sevDesk)</Label>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="z. B. RE-2026-0142" />
          </div>
          <div>
            <Label className="text-xs">Rechnungsdatum</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Betrag netto</Label>
            <Input type="number" value={net} onChange={(e) => setNet(e.target.value)}
              placeholder={String(Number(instruction.instruction_amount_net) || 0)} />
            <p className="text-xs text-muted-foreground mt-1">brutto {gross.toFixed(2)} € bei {vatRate} % MwSt.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={speichern} disabled={saving}>{saving ? 'Wird erfasst…' : 'Erfassen & verbuchen'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}