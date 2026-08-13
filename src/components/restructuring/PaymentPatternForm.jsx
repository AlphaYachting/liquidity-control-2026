import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, X, Check } from 'lucide-react';
import { fmtEUR } from '@/lib/restructuring/restructuringFormat';
import { parseNumberList, validatePattern, patternPreview } from '@/lib/restructuring/paymentPattern';

export default function PaymentPatternForm({ pattern, onSaved, onCancel }) {
  const [form, setForm] = useState({
    name: pattern?.name || '',
    description: pattern?.description || '',
    offsets: (pattern?.offsets_weeks || []).join(', '),
    shares: (pattern?.shares_percent || []).join(', '),
    is_default: !!pattern?.is_default,
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const offsets = parseNumberList(form.offsets);
  const shares = parseNumberList(form.shares);
  const liveError = validatePattern(offsets, shares);
  const preview = liveError ? [] : patternPreview({ offsets_weeks: offsets, shares_percent: shares }, 10000, 4);

  const save = async () => {
    if (!form.name.trim()) { setError('Bitte eine Bezeichnung angeben.'); return; }
    if (liveError) { setError(liveError); return; }
    setError(null);
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description || null,
      offsets_weeks: offsets,
      shares_percent: shares,
      is_default: form.is_default,
    };
    if (pattern?.id) await base44.entities.PaymentPattern.update(pattern.id, payload);
    else await base44.entities.PaymentPattern.create(payload);
    setSaving(false);
    onSaved();
  };

  return (
    <div className="rounded-lg border border-primary/40 bg-muted/20 p-3">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <div>
          <Label className="text-[10px]">Bezeichnung</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-9 mt-1" placeholder="z.B. Staffel 55/35/10" />
        </div>
        <div>
          <Label className="text-[10px]">Beschreibung</Label>
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="h-9 mt-1" placeholder="wofür verwendet" />
        </div>
        <div>
          <Label className="text-[10px]">Wochenversatz</Label>
          <Input value={form.offsets} onChange={(e) => setForm({ ...form, offsets: e.target.value })} className="h-9 mt-1" placeholder="0, 2, 4" />
        </div>
        <div>
          <Label className="text-[10px]">Anteile (%)</Label>
          <Input value={form.shares} onChange={(e) => setForm({ ...form, shares: e.target.value })} className="h-9 mt-1" placeholder="55, 35, 10" />
        </div>
      </div>

      <label className="flex items-center gap-1.5 text-[11px] mt-2">
        <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
        Als Standardstaffel kennzeichnen
      </label>

      {(error || liveError) && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-red-700">
          <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" /> {error || liveError}
        </p>
      )}
      {!liveError && preview.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground tabular-nums">
          Vorschau bei {fmtEUR(10000)} Rechnungsbetrag, Rechnungswoche W4:{' '}
          {preview.map((s, i) => (
            <span key={i} className="text-foreground">
              W{s.week}: {fmtEUR(s.amount)}{i < preview.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </p>
      )}

      <div className="flex items-center gap-2 mt-3">
        <Button size="sm" onClick={save} disabled={saving}>
          <Check className="w-3.5 h-3.5 mr-1" /> Speichern
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="w-3.5 h-3.5 mr-1" /> Abbrechen
        </Button>
      </div>
    </div>
  );
}