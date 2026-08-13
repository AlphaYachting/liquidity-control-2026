import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Save, Check } from 'lucide-react';
import { useRestructuringData } from '@/lib/restructuring/useRestructuringData';
import { fmtEUR, OUTFLOW_CATEGORY_LABELS, OUTFLOW_INTERVAL_LABELS } from '@/lib/restructuring/restructuringFormat';
import { monthlyOutflowTotal } from '@/lib/restructuring/restructuringEngine';
import PaymentPatternSection from '@/components/restructuring/PaymentPatternSection';
import CollectionAssumptionsSection from '@/components/restructuring/CollectionAssumptionsSection';

export default function RestructuringSetup() {
  const { data, isLoading } = useRestructuringData();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['restructuring-data'] });

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Diese Eingaben ergänzen die vorhandenen App-Daten um manuelle Annahmen für die Liquiditäts- und Deckungsauswertung.
      </p>
      <SettingSection data={data} isLoading={isLoading} onSaved={refresh} />
      <CollectionAssumptionsSection setting={data?.setting} onSaved={refresh} />
      <PaymentPatternSection />
      <OutflowSection items={data?.outflowItems || []} onChanged={refresh} />
      <BankSection snapshots={data?.bankSnapshots || []} onChanged={refresh} />
    </div>
  );
}

// ── Stichtag + Stundensatz + Horizont ─────────────────────────────────────
function SettingSection({ data, isLoading, onSaved }) {
  const [form, setForm] = useState({
    insolvency_opening_date: '', wip_blended_hourly_rate: '', planning_horizon_months: 12,
    plan_start_date: '', reporting_hearing_date: '', plan_weeks: 13,
    worst_case_inflow_factor: 0.7, default_vat_rate: 20, amounts_are_gross: 'brutto',
    default_payment_pattern_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [patterns, setPatterns] = useState([]);

  useEffect(() => {
    base44.entities.PaymentPattern.list().then(setPatterns);
  }, []);

  useEffect(() => {
    if (data?.setting) {
      setForm({
        insolvency_opening_date: data.setting.insolvency_opening_date || '',
        wip_blended_hourly_rate: data.setting.wip_blended_hourly_rate ?? '',
        planning_horizon_months: data.setting.planning_horizon_months || 12,
        plan_start_date: data.setting.plan_start_date || '',
        reporting_hearing_date: data.setting.reporting_hearing_date || '',
        plan_weeks: data.setting.plan_weeks || 13,
        worst_case_inflow_factor: data.setting.worst_case_inflow_factor ?? 0.7,
        default_vat_rate: data.setting.default_vat_rate ?? 20,
        amounts_are_gross: data.setting.amounts_are_gross === false ? 'netto' : 'brutto',
        default_payment_pattern_id: data.setting.default_payment_pattern_id || '',
      });
    }
  }, [data?.setting]);

  const save = async () => {
    setSaving(true);
    const payload = {
      insolvency_opening_date: form.insolvency_opening_date || null,
      wip_blended_hourly_rate: Number(form.wip_blended_hourly_rate) || 0,
      planning_horizon_months: Number(form.planning_horizon_months) || 12,
      plan_start_date: form.plan_start_date || null,
      reporting_hearing_date: form.reporting_hearing_date || null,
      plan_weeks: Number(form.plan_weeks) || 13,
      worst_case_inflow_factor: Number(form.worst_case_inflow_factor) || 0.7,
      default_vat_rate: Number(form.default_vat_rate) || 20,
      amounts_are_gross: form.amounts_are_gross !== 'netto',
      default_payment_pattern_id: form.default_payment_pattern_id || null,
    };
    if (data?.setting?.id) {
      await base44.entities.RestructuringSetting.update(data.setting.id, payload);
    } else {
      await base44.entities.RestructuringSetting.create(payload);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved();
  };

  return (
    <Card className="p-4">
      <h2 className="text-sm font-bold mb-3">Stichtag & Bewertungsannahmen</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label className="text-xs">Stichtag Insolvenzeröffnung</Label>
          <Input
            type="date"
            value={form.insolvency_opening_date}
            onChange={(e) => setForm({ ...form, insolvency_opening_date: e.target.value })}
            className="mt-1"
          />
          <p className="text-[10px] text-muted-foreground mt-1">Für Alt-/Neuforderungs-Split im Forderungsspiegel.</p>
        </div>
        <div>
          <Label className="text-xs">WIP-Mischsatz (EUR / Stunde)</Label>
          <Input
            type="number"
            step="0.01"
            value={form.wip_blended_hourly_rate}
            onChange={(e) => setForm({ ...form, wip_blended_hourly_rate: e.target.value })}
            className="mt-1"
            placeholder="z.B. 95.00"
          />
          <p className="text-[10px] text-muted-foreground mt-1">Einheitlicher Satz für die Bewertung unverrechneter awork-Stunden.</p>
        </div>
        <div>
          <Label className="text-xs">Forecast-Zeitraum (Monate)</Label>
          <Input
            type="number"
            min="12"
            max="24"
            value={form.planning_horizon_months}
            onChange={(e) => setForm({ ...form, planning_horizon_months: e.target.value })}
            className="mt-1"
          />
          <p className="text-[10px] text-muted-foreground mt-1">12–24 Monate für Umsatz-Forecast & Deckungsgrundlage.</p>
        </div>
        <div>
          <Label className="text-xs">Planbeginn (Woche 1)</Label>
          <Input
            type="date"
            value={form.plan_start_date}
            onChange={(e) => setForm({ ...form, plan_start_date: e.target.value })}
            className="mt-1"
          />
          <p className="text-[10px] text-muted-foreground mt-1">Fixer Beginn des Wochenplans, immer ein Montag — verschiebt sich nicht, damit Plan und Ist vergleichbar bleiben.</p>
        </div>
        <div>
          <Label className="text-xs">Berichtstagsatzung</Label>
          <Input
            type="date"
            value={form.reporting_hearing_date}
            onChange={(e) => setForm({ ...form, reporting_hearing_date: e.target.value })}
            className="mt-1"
          />
          <p className="text-[10px] text-muted-foreground mt-1">Termin, an dem der Plan beurteilt wird — die betroffene Woche wird im Plan hervorgehoben.</p>
        </div>
        <div>
          <Label className="text-xs">Anzahl Planwochen</Label>
          <Input
            type="number"
            min="1"
            value={form.plan_weeks}
            onChange={(e) => setForm({ ...form, plan_weeks: e.target.value })}
            className="mt-1"
          />
          <p className="text-[10px] text-muted-foreground mt-1">Länge des Wochenplans (Standard: 13 Wochen).</p>
        </div>
        <div>
          <Label className="text-xs">Worst-Case-Faktor Einzahlungen</Label>
          <Input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={form.worst_case_inflow_factor}
            onChange={(e) => setForm({ ...form, worst_case_inflow_factor: e.target.value })}
            className="mt-1"
          />
          <p className="text-[10px] text-muted-foreground mt-1">Im Worst-Case-Szenario werden alle Einzahlungen mit diesem Faktor multipliziert (z.B. 0,70 = −30 %); Auszahlungen bleiben unverändert.</p>
        </div>
        <div>
          <Label className="text-xs">Standard-USt-Satz (%)</Label>
          <Input
            type="number"
            step="1"
            min="0"
            value={form.default_vat_rate}
            onChange={(e) => setForm({ ...form, default_vat_rate: e.target.value })}
            className="mt-1"
          />
          <p className="text-[10px] text-muted-foreground mt-1">Standard-Umsatzsteuersatz für die Brutto-/Netto-Umrechnung.</p>
        </div>
        <div>
          <Label className="text-xs">Leitwährung der Planung</Label>
          <Select value={form.amounts_are_gross} onValueChange={(v) => setForm({ ...form, amounts_are_gross: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="brutto">Brutto (inkl. USt)</SelectItem>
              <SelectItem value="netto">Netto (exkl. USt)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground mt-1">Ob die Planbeträge brutto oder netto geführt werden — Liquidität ist immer brutto.</p>
        </div>
        <div>
          <Label className="text-xs">Standard-Zahlungsstaffel</Label>
          <Select
            value={form.default_payment_pattern_id || 'none'}
            onValueChange={(v) => setForm({ ...form, default_payment_pattern_id: v === 'none' ? '' : v })}
          >
            <SelectTrigger className="mt-1"><SelectValue placeholder="Keine" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Keine</SelectItem>
              {patterns.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground mt-1">Staffel, mit der Rechnungsbeträge standardmäßig auf Wochen verteilt werden.</p>
        </div>
      </div>
      <div className="mt-4">
        <Button size="sm" onClick={save} disabled={saving || isLoading}>
          {saved ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
          {saved ? 'Gespeichert' : 'Speichern'}
        </Button>
      </div>
    </Card>
  );
}

// ── Monatliche Auszahlungen (Einzelposten je Kategorie) ───────────────────
const EMPTY_OUTFLOW = {
  category: 'nettoloehne', label: '', amount: '', due_day_of_month: 1,
  interval: 'monthly', first_due_month: '', is_masseverbindlichkeit: true,
  scenario_only: false, derivation: '', start_month: '', end_month: '', is_active: true,
};

function OutflowSection({ items, onChanged }) {
  const [draft, setDraft] = useState(EMPTY_OUTFLOW);
  const [adding, setAdding] = useState(false);

  const add = async () => {
    if (!draft.label || !draft.amount) return;
    setAdding(true);
    await base44.entities.CashOutflowItem.create({
      category: draft.category,
      label: draft.label,
      amount: Number(draft.amount) || 0,
      due_day_of_month: Number(draft.due_day_of_month) || 1,
      interval: draft.interval || 'monthly',
      first_due_month: draft.first_due_month || null,
      is_masseverbindlichkeit: !!draft.is_masseverbindlichkeit,
      scenario_only: !!draft.scenario_only,
      derivation: draft.derivation || null,
      start_month: draft.start_month || null,
      end_month: draft.end_month || null,
      is_active: true,
    });
    setDraft(EMPTY_OUTFLOW);
    setAdding(false);
    onChanged();
  };

  const remove = async (id) => {
    await base44.entities.CashOutflowItem.delete(id);
    onChanged();
  };

  const monthlyTotal = monthlyOutflowTotal(items);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold">Monatliche Auszahlungen</h2>
        <span className="text-xs text-muted-foreground">Summe / Monat: <b className="text-foreground">{fmtEUR(monthlyTotal)}</b></span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-2 px-2">Kategorie</th>
              <th className="text-left py-2 px-2">Bezeichnung</th>
              <th className="text-right py-2 px-2">Betrag</th>
              <th className="text-left py-2 px-2">Rhythmus</th>
              <th className="text-right py-2 px-2">Fällig am</th>
              <th className="py-2 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">Noch keine Auszahlungen erfasst.</td></tr>
            )}
            {items.map((o) => (
              <tr key={o.id} className="border-b border-border/50">
                <td className="py-1.5 px-2">{OUTFLOW_CATEGORY_LABELS[o.category] || o.category}</td>
                <td className="py-1.5 px-2">
                  {o.label}
                  {o.scenario_only && <span className="ml-1.5 text-[10px] text-purple-700 font-semibold">(nur Szenario)</span>}
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums">{fmtEUR(o.amount)}</td>
                <td className="py-1.5 px-2">{OUTFLOW_INTERVAL_LABELS[o.interval] || 'monatlich'}{o.first_due_month ? ` ab ${o.first_due_month}` : ''}</td>
                <td className="py-1.5 px-2 text-right">{o.due_day_of_month || 1}.</td>
                <td className="py-1.5 px-2 text-right">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => remove(o.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mt-3 items-end">
        <div>
          <Label className="text-[10px]">Kategorie</Label>
          <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}>
            <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(OUTFLOW_CATEGORY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label className="text-[10px]">Bezeichnung</Label>
          <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className="h-9 mt-1" placeholder="z.B. Löhne Team" />
        </div>
        <div>
          <Label className="text-[10px]">Betrag je Fälligkeit</Label>
          <Input type="number" step="0.01" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} className="h-9 mt-1" placeholder="0.00" />
        </div>
        <div>
          <Label className="text-[10px]">Fälligkeitstag (1–28)</Label>
          <Input type="number" min="1" max="28" value={draft.due_day_of_month} onChange={(e) => setDraft({ ...draft, due_day_of_month: e.target.value })} className="h-9 mt-1" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mt-2 items-end">
        <div>
          <Label className="text-[10px]">Rhythmus</Label>
          <Select value={draft.interval} onValueChange={(v) => setDraft({ ...draft, interval: v })}>
            <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(OUTFLOW_INTERVAL_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px]">Erster Fälligkeitsmonat</Label>
          <Input type="month" value={draft.first_due_month} onChange={(e) => setDraft({ ...draft, first_due_month: e.target.value })} className="h-9 mt-1" />
          <p className="text-[9px] text-muted-foreground mt-0.5">Nur bei quartalsweise / jährlich / einmalig.</p>
        </div>
        <div className="sm:col-span-2">
          <Label className="text-[10px]">Herleitung / Quelle des Betrags</Label>
          <Input value={draft.derivation} onChange={(e) => setDraft({ ...draft, derivation: e.target.value })} className="h-9 mt-1" placeholder="z.B. Lohnverrechnung Juli, Mietvertrag §3" />
        </div>
        <div className="space-y-1.5 pb-1">
          <label className="flex items-center gap-1.5 text-[11px]">
            <input type="checkbox" checked={draft.is_masseverbindlichkeit} onChange={(e) => setDraft({ ...draft, is_masseverbindlichkeit: e.target.checked })} />
            Masseverbindlichkeit
          </label>
          <label className="flex items-center gap-1.5 text-[11px]">
            <input type="checkbox" checked={draft.scenario_only} onChange={(e) => setDraft({ ...draft, scenario_only: e.target.checked })} />
            Nur Szenario (nicht im Basisplan)
          </label>
        </div>
      </div>

      <div className="mt-3">
        <Button size="sm" onClick={add} disabled={adding || !draft.label || !draft.amount}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Hinzufügen
        </Button>
      </div>
    </Card>
  );
}

// ── Bankanfangsbestand (je Woche fortschreibbar) ──────────────────────────
function BankSection({ snapshots, onChanged }) {
  const [draft, setDraft] = useState({ balance_date: new Date().toISOString().slice(0, 10), amount: '' });
  const [adding, setAdding] = useState(false);

  const add = async () => {
    if (!draft.balance_date || draft.amount === '') return;
    setAdding(true);
    await base44.entities.BankBalanceSnapshot.create({
      balance_date: draft.balance_date,
      amount: Number(draft.amount) || 0,
    });
    setDraft({ balance_date: new Date().toISOString().slice(0, 10), amount: '' });
    setAdding(false);
    onChanged();
  };

  const remove = async (id) => {
    await base44.entities.BankBalanceSnapshot.delete(id);
    onChanged();
  };

  const sorted = [...snapshots].sort((a, b) => new Date(b.balance_date) - new Date(a.balance_date));

  return (
    <Card className="p-4">
      <h2 className="text-sm font-bold mb-3">Bankanfangsbestand (wöchentlich fortschreibbar)</h2>
      <p className="text-[11px] text-muted-foreground mb-3">
        Der jüngste Bestand bis heute wird als Startwert der 13-Wochen-Vorschau verwendet.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-2 px-2">Datum</th>
              <th className="text-right py-2 px-2">Bestand</th>
              <th className="py-2 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={3} className="py-4 text-center text-muted-foreground">Noch kein Bestand erfasst.</td></tr>
            )}
            {sorted.map((s) => (
              <tr key={s.id} className="border-b border-border/50">
                <td className="py-1.5 px-2">{new Intl.DateTimeFormat('de-AT').format(new Date(s.balance_date))}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{fmtEUR(s.amount)}</td>
                <td className="py-1.5 px-2 text-right">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => remove(s.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3 items-end">
        <div>
          <Label className="text-[10px]">Datum</Label>
          <Input type="date" value={draft.balance_date} onChange={(e) => setDraft({ ...draft, balance_date: e.target.value })} className="h-9 mt-1" />
        </div>
        <div>
          <Label className="text-[10px]">Bestand (EUR)</Label>
          <Input type="number" step="0.01" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} className="h-9 mt-1" placeholder="0.00" />
        </div>
        <div>
          <Button size="sm" onClick={add} disabled={adding || draft.amount === ''} className="w-full h-9">
            <Plus className="w-3.5 h-3.5 mr-1" /> Erfassen
          </Button>
        </div>
      </div>
    </Card>
  );
}