import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const STATUS_CFG = {
  draft:                'Entwurf',
  ready_for_backoffice: 'Bereit für Backoffice',
  sent_to_backoffice:   'An Backoffice gesendet',
  invoice_created:      'Rechnung erstellt',
  paid:                 'Bezahlt',
  blocked:              'Blockiert',
  cancelled:            'Storniert',
};

const INVOICE_TYPES = {
  advance_invoice: 'Anzahlung',
  partial_invoice: 'Teilrechnung',
  final_invoice:   'Schlussrechnung',
  correction:      'Korrektur',
  credit_note:     'Gutschrift',
};

const INSTRUCTION_TYPES = {
  package_based:    'Paket',
  percentage_based: 'Prozentual',
  manual_amount:    'Frei (manueller Betrag)',
};

const BACKOFFICE_USERS = ['Anna', 'Birgit', 'Christine', 'Maria'];

export default function BillingInstructionEditDialog({ instruction, open, onClose, onSave }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (instruction) {
      setForm({
        status:                    instruction.status || 'draft',
        invoice_type:              instruction.invoice_type || 'partial_invoice',
        instruction_type:          instruction.instruction_type || 'manual_amount',
        instruction_amount_net:    instruction.instruction_amount_net ?? 0,
        instruction_amount_gross:  instruction.instruction_amount_gross ?? 0,
        vat_rate:                  instruction.vat_rate ?? 20,
        invoice_reason:            instruction.invoice_reason || '',
        invoice_instruction_text:  instruction.invoice_instruction_text || '',
        internal_note:             instruction.internal_note || '',
        backoffice_note:           instruction.backoffice_note || '',
        planned_invoice_date:      instruction.planned_invoice_date || '',
        requested_by_pm:           instruction.requested_by_pm || '',
        assigned_backoffice_user:  instruction.assigned_backoffice_user || '',
        new_billing_percent:       instruction.new_billing_percent ?? 0,
        additional_billing_percent: instruction.additional_billing_percent ?? 0,
      });
    }
  }, [instruction]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Auto-calculate gross when net or vat changes
  const handleNetChange = (v) => {
    const net = parseFloat(v) || 0;
    const vat = parseFloat(form.vat_rate) || 0;
    set('instruction_amount_net', v);
    set('instruction_amount_gross', Math.round(net * (1 + vat / 100) * 100) / 100);
  };
  const handleVatChange = (v) => {
    const net = parseFloat(form.instruction_amount_net) || 0;
    const vat = parseFloat(v) || 0;
    set('vat_rate', v);
    set('instruction_amount_gross', Math.round(net * (1 + vat / 100) * 100) / 100);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        instruction_amount_net:    parseFloat(form.instruction_amount_net) || 0,
        instruction_amount_gross:  parseFloat(form.instruction_amount_gross) || 0,
        vat_rate:                  parseFloat(form.vat_rate) || 20,
        new_billing_percent:       parseFloat(form.new_billing_percent) || 0,
        additional_billing_percent: parseFloat(form.additional_billing_percent) || 0,
      };
      await onSave(instruction.id, payload);
      toast.success('Abrechnungsanweisung gespeichert');
      onClose();
    } catch (e) {
      toast.error('Fehler beim Speichern', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (!instruction) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Abrechnungsanweisung bearbeiten</DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {instruction.customer_name} · {instruction.project_name}
          </p>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          {/* Status */}
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={form.status} onValueChange={v => set('status', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_CFG).map(([v, l]) => (
                  <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Rechnungstyp */}
          <div className="space-y-1">
            <Label className="text-xs">Rechnungstyp</Label>
            <Select value={form.invoice_type} onValueChange={v => set('invoice_type', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(INVOICE_TYPES).map(([v, l]) => (
                  <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Anweisungstyp */}
          <div className="space-y-1">
            <Label className="text-xs">Anweisungstyp</Label>
            <Select value={form.instruction_type} onValueChange={v => set('instruction_type', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(INSTRUCTION_TYPES).map(([v, l]) => (
                  <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* MwSt. */}
          <div className="space-y-1">
            <Label className="text-xs">MwSt. (%)</Label>
            <Input type="number" value={form.vat_rate} onChange={e => handleVatChange(e.target.value)} className="h-8 text-xs" />
          </div>

          {/* Betrag netto */}
          <div className="space-y-1">
            <Label className="text-xs">Betrag netto (€)</Label>
            <Input type="number" value={form.instruction_amount_net} onChange={e => handleNetChange(e.target.value)} className="h-8 text-xs" />
          </div>

          {/* Betrag brutto */}
          <div className="space-y-1">
            <Label className="text-xs">Betrag brutto (€) — auto</Label>
            <Input type="number" value={form.instruction_amount_gross} onChange={e => set('instruction_amount_gross', e.target.value)} className="h-8 text-xs" />
          </div>

          {/* Abrechnungsstand */}
          <div className="space-y-1">
            <Label className="text-xs">Neuer Abrechnungsstand (%)</Label>
            <Input type="number" min={0} max={100} value={form.new_billing_percent} onChange={e => set('new_billing_percent', e.target.value)} className="h-8 text-xs" />
          </div>

          {/* Zusätzlich abzurechnen */}
          <div className="space-y-1">
            <Label className="text-xs">Zusätzlich abzurechnen (%)</Label>
            <Input type="number" min={0} max={100} value={form.additional_billing_percent} onChange={e => set('additional_billing_percent', e.target.value)} className="h-8 text-xs" />
          </div>

          {/* Geplantes Rechnungsdatum */}
          <div className="space-y-1">
            <Label className="text-xs">Geplantes Rechnungsdatum</Label>
            <Input type="date" value={form.planned_invoice_date} onChange={e => set('planned_invoice_date', e.target.value)} className="h-8 text-xs" />
          </div>

          {/* Zuständiger PM */}
          <div className="space-y-1">
            <Label className="text-xs">Zuständiger PM</Label>
            <Input value={form.requested_by_pm} onChange={e => set('requested_by_pm', e.target.value)} className="h-8 text-xs" placeholder="Name PM" />
          </div>

          {/* Backoffice-Zuweisung */}
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Zuständig Backoffice</Label>
            <Select value={form.assigned_backoffice_user || 'none'} onValueChange={v => set('assigned_backoffice_user', v === 'none' ? '' : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Nicht zugewiesen" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">Nicht zugewiesen</SelectItem>
                {BACKOFFICE_USERS.map(u => <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Abrechnungsgrund */}
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Abrechnungsgrund</Label>
            <Input value={form.invoice_reason} onChange={e => set('invoice_reason', e.target.value)} className="h-8 text-xs" placeholder="z.B. Abnahme Phase 1 erfolgt" />
          </div>

          {/* Rechnungstext */}
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Rechnungstext / Anweisung ans Backoffice</Label>
            <Textarea value={form.invoice_instruction_text} onChange={e => set('invoice_instruction_text', e.target.value)} className="text-xs min-h-[72px]" placeholder="Text für die Rechnung oder Hinweise ans Backoffice..." />
          </div>

          {/* Interne Notiz */}
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Interne Notiz (nur für PMs)</Label>
            <Textarea value={form.internal_note} onChange={e => set('internal_note', e.target.value)} className="text-xs min-h-[56px]" placeholder="Interne Hinweise..." />
          </div>

          {/* Backoffice-Notiz */}
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Backoffice-Notiz</Label>
            <Textarea value={form.backoffice_note} onChange={e => set('backoffice_note', e.target.value)} className="text-xs min-h-[56px]" placeholder="Rückmeldung vom Backoffice..." />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Wird gespeichert…' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}