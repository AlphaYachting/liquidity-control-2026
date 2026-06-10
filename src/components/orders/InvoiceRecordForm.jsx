import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, X } from 'lucide-react';

export default function InvoiceRecordForm({ invoice, confirmedOrderId, billingBlocks = [], onSave, onCancel, isSaving }) {
  const [form, setForm] = useState({
    invoice_number: '',
    invoice_date: '',
    customer_name: '',
    confirmed_order_id: confirmedOrderId || '',
    billing_block_id: '',
    invoice_type: 'partial_invoice',
    is_credit_note: false,
    net_amount: '',
    gross_amount: '',
    vat_rate: 20,
    due_date: '',
    payment_status: 'open',
    paid_amount: 0,
    source_type: 'manual',
    notes: '',
    match_status: 'manually_matched',
    match_confidence: 100,
    ...invoice,
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const net = Number(form.net_amount) || 0;
    const vat = Number(form.vat_rate) || 20;
    const gross = Number(form.gross_amount) || net * (1 + vat / 100);
    const paid = Number(form.paid_amount) || 0;
    onSave({
      ...form,
      net_amount: net,
      gross_amount: gross,
      vat_amount: gross - net,
      vat_rate: vat,
      paid_amount: paid,
      open_amount: gross - paid,
      is_credit_note: Boolean(form.is_credit_note),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm font-semibold">{invoice ? 'Rechnung bearbeiten' : 'Neue Rechnung'}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Rechnungsnummer</Label>
          <Input value={form.invoice_number} onChange={e => set('invoice_number', e.target.value)} placeholder="RE-2026-001" />
        </div>
        <div>
          <Label className="text-xs">Rechnungsdatum</Label>
          <Input type="date" value={form.invoice_date} onChange={e => set('invoice_date', e.target.value)} />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Kundenname</Label>
          <Input required value={form.customer_name} onChange={e => set('customer_name', e.target.value)} placeholder="Kunde GmbH" />
        </div>
        <div>
          <Label className="text-xs">Typ</Label>
          <Select value={form.invoice_type} onValueChange={v => set('invoice_type', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[['partial_invoice','Teilrechnung'],['final_invoice','Schlussrechnung'],['advance_invoice','Anzahlung'],['correction','Korrektur'],['credit_note','Gutschrift']].map(([v,l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Verknüpftes Paket</Label>
          <Select value={form.billing_block_id || '__none__'} onValueChange={v => set('billing_block_id', v === '__none__' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Paket wählen…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Kein Paket —</SelectItem>
              {billingBlocks.map(b => (
                <SelectItem key={b.id} value={b.id} className="text-xs">{b.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Betrag netto (€) *</Label>
          <Input required type="number" value={form.net_amount} onChange={e => set('net_amount', e.target.value)} placeholder="5000" />
        </div>
        <div>
          <Label className="text-xs">MwSt. (%)</Label>
          <Input type="number" value={form.vat_rate} onChange={e => set('vat_rate', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Betrag brutto (€)</Label>
          <Input type="number" value={form.gross_amount} onChange={e => set('gross_amount', e.target.value)} placeholder="Auto aus Netto" />
        </div>
        <div>
          <Label className="text-xs">Fällig am</Label>
          <Input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Zahlungsstatus</Label>
          <Select value={form.payment_status} onValueChange={v => set('payment_status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[['open','Offen'],['partially_paid','Teilbezahlt'],['paid','Bezahlt'],['overdue','Überfällig'],['cancelled','Storniert'],['unclear','Unklar']].map(([v,l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs flex items-center gap-1">
            Bezahlt brutto (€)
            <span
              title="Bitte den bezahlten Bruttobetrag eingeben. Forderungen werden gegen den Bruttobetrag der Rechnung berechnet."
              className="cursor-help text-muted-foreground text-xs ml-1"
            >ⓘ</span>
          </Label>
          <Input type="number" value={form.paid_amount} onChange={e => set('paid_amount', e.target.value)} />
          <p className="text-xs text-muted-foreground mt-0.5">Brutto — nicht Netto</p>
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Notizen</Label>
          <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={isSaving}>
          <Save className="w-3.5 h-3.5 mr-1" /> {isSaving ? 'Speichern…' : 'Speichern'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          <X className="w-3.5 h-3.5 mr-1" /> Abbrechen
        </Button>
      </div>
    </form>
  );
}