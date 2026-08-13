import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, Check } from 'lucide-react';
import { DEFAULT_COLLECTION, BUCKET_LABELS } from '@/lib/restructuring/restructuringEngine';

const BUCKETS = [
  { key: '0_30', rate: 'collect_rate_0_30', from: 'collect_week_from_0_30', to: 'collect_week_to_0_30' },
  { key: '31_60', rate: 'collect_rate_31_60', from: 'collect_week_from_31_60', to: 'collect_week_to_31_60' },
  { key: '61_90', rate: 'collect_rate_61_90', from: 'collect_week_from_61_90', to: 'collect_week_to_61_90' },
  { key: '90_plus', rate: 'collect_rate_90_plus', from: 'collect_week_from_90_plus', to: 'collect_week_to_90_plus' },
];

const EMPTY = () => {
  const f = { max_monthly_billing_gross: 45000, billing_to_cash_weeks: 4 };
  BUCKETS.forEach((b) => {
    f[b.rate] = DEFAULT_COLLECTION[b.key].rate;
    f[b.from] = DEFAULT_COLLECTION[b.key].from;
    f[b.to] = DEFAULT_COLLECTION[b.key].to;
  });
  return f;
};

export default function CollectionAssumptionsSection({ setting, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!setting) return;
    const base = EMPTY();
    Object.keys(base).forEach((k) => {
      if (setting[k] !== null && setting[k] !== undefined && setting[k] !== '') base[k] = setting[k];
    });
    setForm(base);
  }, [setting]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    const payload = {};
    Object.entries(form).forEach(([k, v]) => { payload[k] = Number(v) || 0; });
    if (setting?.id) await base44.entities.RestructuringSetting.update(setting.id, payload);
    else await base44.entities.RestructuringSetting.create(payload);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved();
  };

  return (
    <Card className="p-4">
      <h2 className="text-sm font-bold mb-1">Einbringlichkeit & Kapazität (Liquiditätsannahmen)</h2>
      <p className="text-[11px] text-muted-foreground mb-3">
        Alle Beträge der Liquiditätsrechnung sind Bruttowerte. Überfällige Forderungen werden nicht mehr vollständig
        in Woche 1 angesetzt, sondern mit einer Quote je Altersklasse über ein Zeitfenster verteilt.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-2 px-2">Altersklasse</th>
              <th className="text-right py-2 px-2 w-28">Quote (%)</th>
              <th className="text-right py-2 px-2 w-28">von Woche</th>
              <th className="text-right py-2 px-2 w-28">bis Woche</th>
            </tr>
          </thead>
          <tbody>
            {BUCKETS.map((b) => (
              <tr key={b.key} className="border-b border-border/50">
                <td className="py-1.5 px-2">{BUCKET_LABELS[b.key]}</td>
                <td className="py-1.5 px-2">
                  <Input type="number" min="0" max="100" value={form[b.rate]} onChange={(e) => set(b.rate, e.target.value)} className="h-8 text-right" />
                </td>
                <td className="py-1.5 px-2">
                  <Input type="number" min="1" value={form[b.from]} onChange={(e) => set(b.from, e.target.value)} className="h-8 text-right" />
                </td>
                <td className="py-1.5 px-2">
                  <Input type="number" min="1" value={form[b.to]} onChange={(e) => set(b.to, e.target.value)} className="h-8 text-right" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div>
          <Label className="text-xs">Kapazitätsgrenze Fakturierung (EUR brutto / Monat)</Label>
          <Input
            type="number"
            step="100"
            value={form.max_monthly_billing_gross}
            onChange={(e) => set('max_monthly_billing_gross', e.target.value)}
            className="mt-1"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Obergrenze der aus dem Auftragsbestand abgeleiteten Fakturierung je Monat. Der Deckel liegt bewusst
            deutlich unter dem historischen Durchschnitt und dient der konservativen Planung. Überhang verschiebt
            sich in die Folgemonate; 0 bedeutet kein Deckel.
          </p>
        </div>
        <div>
          <Label className="text-xs">Zeitversatz Leistung bis Zahlungseingang (Wochen)</Label>
          <Input
            type="number"
            min="0"
            value={form.billing_to_cash_weeks}
            onChange={(e) => set('billing_to_cash_weeks', e.target.value)}
            className="mt-1"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Zwischen Leistung, Rechnungslegung und Zahlungseingang liegen real vier bis sechs Wochen.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <Button size="sm" onClick={save} disabled={saving}>
          {saved ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
          {saved ? 'Gespeichert' : 'Speichern'}
        </Button>
      </div>
    </Card>
  );
}