import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Calculator } from 'lucide-react';
import { fmtEUR } from '@/lib/restructuring/restructuringFormat';
import {
  categoriesFor, CLAIM_TYPE_LABELS, SOURCE_TYPE_LABELS,
  deriveSplit, validatePlanItem, suggestAltShare,
} from '@/lib/restructuring/cashflowPlan';

const emptyItem = (planId, vatRate) => ({
  plan_id: planId, direction: 'inflow', category: 'projekt_neuleistung', label: '',
  customer_or_supplier: '', claim_type: 'neu', service_period_start: '', service_period_end: '',
  progress_at_cutoff: '', amount_gross: '', amount_alt_gross: '', amount_neu_gross: '',
  vat_rate: vatRate, invoice_date: '', payment_pattern_id: '', fixed_week_index: '',
  is_masseverbindlichkeit: true, source_type: 'manual', source_id: '', scenario_only: false,
  derivation: '', notes: '',
});

export default function CashflowPlanItemDialog({ open, onOpenChange, planId, item, patterns, defaultVatRate, onSaved }) {
  const [form, setForm] = useState(emptyItem(planId, defaultVatRate));
  const [helper, setHelper] = useState({ orderTotalGross: '', alreadyInvoicedGross: '' });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setHelper({ orderTotalGross: '', alreadyInvoicedGross: '' });
    setForm(item
      ? { ...emptyItem(planId, defaultVatRate), ...item,
          amount_gross: item.amount_gross ?? '', amount_alt_gross: item.amount_alt_gross ?? '',
          amount_neu_gross: item.amount_neu_gross ?? '', progress_at_cutoff: item.progress_at_cutoff ?? '',
          fixed_week_index: item.fixed_week_index ?? '' }
      : emptyItem(planId, defaultVatRate));
  }, [open, item, planId, defaultVatRate]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const locked = form.claim_type !== 'gemischt';
  const split = deriveSplit(form.claim_type, form.amount_gross, form.amount_alt_gross, form.amount_neu_gross);

  const applyHelper = () => {
    const s = suggestAltShare({
      amountGross: form.amount_gross,
      progressPercent: form.progress_at_cutoff,
      orderTotalGross: helper.orderTotalGross,
      alreadyInvoicedGross: helper.alreadyInvoicedGross,
    });
    set({ claim_type: 'gemischt', amount_alt_gross: s.alt, amount_neu_gross: s.neu, derivation: s.derivation });
  };

  const save = async () => {
    const payload = {
      ...form,
      amount_gross: Number(form.amount_gross) || 0,
      vat_rate: Number(form.vat_rate) || 0,
      progress_at_cutoff: form.progress_at_cutoff === '' ? null : Number(form.progress_at_cutoff),
      fixed_week_index: form.fixed_week_index === '' ? null : Number(form.fixed_week_index),
      ...deriveSplit(form.claim_type, form.amount_gross, form.amount_alt_gross, form.amount_neu_gross),
      service_period_start: form.service_period_start || null,
      service_period_end: form.service_period_end || null,
      invoice_date: form.invoice_date || null,
      payment_pattern_id: form.payment_pattern_id || null,
    };
    const err = validatePlanItem(payload);
    if (err) { setError(err); return; }
    setError(null);
    setSaving(true);
    if (item?.id) await base44.entities.CashflowPlanItem.update(item.id, payload);
    else await base44.entities.CashflowPlanItem.create(payload);
    setSaving(false);
    onSaved();
    onOpenChange(false);
  };

  const cats = categoriesFor(form.direction);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{item ? 'Planposition bearbeiten' : 'Neue Planposition'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-[11px]">Richtung</Label>
            <Select value={form.direction} onValueChange={(v) => set({ direction: v, category: Object.keys(categoriesFor(v))[0] })}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="inflow">Einzahlung</SelectItem>
                <SelectItem value="outflow">Auszahlung</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px]">Kategorie</Label>
            <Select value={form.category} onValueChange={(v) => set({ category: v })}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(cats).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px]">Quelle</Label>
            <Select value={form.source_type} onValueChange={(v) => set({ source_type: v })}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(SOURCE_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2">
            <Label className="text-[11px]">Bezeichnung</Label>
            <Input value={form.label} onChange={(e) => set({ label: e.target.value })} className="h-9 mt-1" />
          </div>
          <div>
            <Label className="text-[11px]">Kunde / Lieferant</Label>
            <Input value={form.customer_or_supplier} onChange={(e) => set({ customer_or_supplier: e.target.value })} className="h-9 mt-1" />
          </div>

          <div>
            <Label className="text-[11px]">Abgrenzung (Pflicht)</Label>
            <Select value={form.claim_type} onValueChange={(v) => set({ claim_type: v })}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CLAIM_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px]">Leistungszeitraum von</Label>
            <Input type="date" value={form.service_period_start || ''} onChange={(e) => set({ service_period_start: e.target.value })} className="h-9 mt-1" />
          </div>
          <div>
            <Label className="text-[11px]">Leistungszeitraum bis</Label>
            <Input type="date" value={form.service_period_end || ''} onChange={(e) => set({ service_period_end: e.target.value })} className="h-9 mt-1" />
          </div>

          <div>
            <Label className="text-[11px]">Betrag brutto</Label>
            <Input type="number" step="0.01" value={form.amount_gross} onChange={(e) => set({ amount_gross: e.target.value })} className="h-9 mt-1" />
          </div>
          <div>
            <Label className="text-[11px]">davon ALT (brutto)</Label>
            <Input type="number" step="0.01" disabled={locked}
              value={locked ? split.amount_alt_gross : form.amount_alt_gross}
              onChange={(e) => set({ amount_alt_gross: e.target.value })} className="h-9 mt-1" />
          </div>
          <div>
            <Label className="text-[11px]">davon NEU (brutto)</Label>
            <Input type="number" step="0.01" disabled={locked}
              value={locked ? split.amount_neu_gross : form.amount_neu_gross}
              onChange={(e) => set({ amount_neu_gross: e.target.value })} className="h-9 mt-1" />
          </div>

          <div>
            <Label className="text-[11px]">USt-Satz (%)</Label>
            <Input type="number" step="1" value={form.vat_rate} onChange={(e) => set({ vat_rate: e.target.value })} className="h-9 mt-1" />
          </div>
          <div>
            <Label className="text-[11px]">Rechnungsdatum</Label>
            <Input type="date" value={form.invoice_date || ''} onChange={(e) => set({ invoice_date: e.target.value })} className="h-9 mt-1" />
          </div>
          <div>
            <Label className="text-[11px]">Fortschritt am Stichtag (%)</Label>
            <Input type="number" step="1" value={form.progress_at_cutoff} onChange={(e) => set({ progress_at_cutoff: e.target.value })} className="h-9 mt-1" />
          </div>

          <div>
            <Label className="text-[11px]">Zahlungsstaffel</Label>
            <Select value={form.payment_pattern_id || 'none'} onValueChange={(v) => set({ payment_pattern_id: v === 'none' ? '' : v })}>
              <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Keine" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Keine</SelectItem>
                {patterns.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px]">oder feste Planwoche</Label>
            <Input type="number" min="1" value={form.fixed_week_index} onChange={(e) => set({ fixed_week_index: e.target.value })} className="h-9 mt-1" placeholder="1–13" />
          </div>
          {form.direction === 'outflow' && (
            <div className="flex flex-col justify-end gap-1.5 pb-1">
              <label className="flex items-center gap-1.5 text-[11px]">
                <input type="checkbox" checked={!!form.is_masseverbindlichkeit} onChange={(e) => set({ is_masseverbindlichkeit: e.target.checked })} />
                Masseverbindlichkeit
              </label>
              <label className="flex items-center gap-1.5 text-[11px]">
                <input type="checkbox" checked={!!form.scenario_only} onChange={(e) => set({ scenario_only: e.target.checked })} />
                Nur Szenario
              </label>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-3 mt-1">
          <p className="text-[11px] font-semibold flex items-center gap-1.5"><Calculator className="w-3.5 h-3.5" /> Berechnungshilfe Altanteil</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Altanteil = min(Rechnungsbetrag; max(0; Fortschritt % × Auftragssumme − bereits fakturiert)). Der Vorschlag ist überschreibbar.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 items-end">
            <div>
              <Label className="text-[10px]">Auftragssumme brutto</Label>
              <Input type="number" step="0.01" value={helper.orderTotalGross} onChange={(e) => setHelper({ ...helper, orderTotalGross: e.target.value })} className="h-9 mt-1" />
            </div>
            <div>
              <Label className="text-[10px]">bereits fakturiert brutto</Label>
              <Input type="number" step="0.01" value={helper.alreadyInvoicedGross} onChange={(e) => setHelper({ ...helper, alreadyInvoicedGross: e.target.value })} className="h-9 mt-1" />
            </div>
            <Button size="sm" variant="outline" onClick={applyHelper}
              disabled={!form.amount_gross || !form.progress_at_cutoff || !helper.orderTotalGross}>
              Altanteil vorschlagen
            </Button>
          </div>
        </div>

        <div>
          <Label className="text-[11px]">Herleitung (Pflicht bei manuellen Positionen)</Label>
          <Textarea value={form.derivation} onChange={(e) => set({ derivation: e.target.value })} className="mt-1 text-xs" rows={2} />
        </div>

        {error && (
          <p className="flex items-start gap-1.5 text-[11px] text-red-700">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {error}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          Aufteilung: ALT {fmtEUR(split.amount_alt_gross)} · NEU {fmtEUR(split.amount_neu_gross)} · Gesamt {fmtEUR(form.amount_gross)}
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={save} disabled={saving}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}