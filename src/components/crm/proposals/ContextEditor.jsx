import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save } from 'lucide-react';

const CONTEXT_FIELDS = [
  ['client_core_business', 'Kernbusiness (1 Satz)'],
  ['client_industry', 'Branche'],
  ['client_target_audience', 'Zielgruppe (B2B/B2C)'],
  ['client_usp', 'USP'],
  ['client_existing_marketing', 'Bestehendes Marketing'],
  ['client_project_scope', 'Projektumfang — was ist IN / NICHT IN'],
];

export default function ContextEditor({ proposal, notes, onNotesChange, onSave, saving }) {
  const [form, setForm] = useState(() =>
    Object.fromEntries(CONTEXT_FIELDS.map(([k]) => [k, proposal[k] || ''])));
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Schritt 1 — Kundenkontext & Gesprächsnotizen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {CONTEXT_FIELDS.map(([key, label]) => (
            <div key={key} className={key === 'client_project_scope' ? 'md:col-span-2' : ''}>
              <Label className="text-xs">{label}</Label>
              <Input value={form[key]} onChange={e => set(key, e.target.value)} className="mt-1" />
            </div>
          ))}
        </div>
        <div>
          <Label className="text-xs">Gesprächsnotizen / Briefing *</Label>
          <Textarea
            value={notes}
            onChange={e => onNotesChange(e.target.value)}
            placeholder="Gesprächsnotizen, Transkript oder Briefing hier einfügen…"
            className="mt-1 min-h-[200px] text-sm"
          />
        </div>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => onSave(form)} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Speichern
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}