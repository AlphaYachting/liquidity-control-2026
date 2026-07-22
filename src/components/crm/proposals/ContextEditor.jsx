import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Loader2, Save } from 'lucide-react';
import SourceDocumentsPanel from '@/components/crm/proposals/SourceDocumentsPanel';

const CONTEXT_FIELDS = [
  ['client_industry', 'Branche'],
  ['client_core_business', 'Kernbusiness'],
  ['client_target_audience', 'Zielgruppe (B2B/B2C)'],
  ['client_usp', 'USP'],
  ['client_existing_marketing', 'Bestehendes Marketing'],
  ['client_project_scope', 'Projektumfang — was ist IN / NICHT IN'],
];

export default function ContextEditor({ proposal, notes, onNotesChange, onSave, saving, onAddDocument, onRemoveDocument }) {
  const [form, setForm] = useState(() =>
    Object.fromEntries(CONTEXT_FIELDS.map(([k]) => [k, proposal[k] || ''])));
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    setForm(Object.fromEntries(CONTEXT_FIELDS.map(([k]) => [k, proposal[k] || ''])));
  }, [proposal.updated_date]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Schritt 1a — Quell-Dokumente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <SourceDocumentsPanel
            title="Erst-Input — Transkript, Kunden-E-Mail oder Sprachmemo"
            hint="Jeder Upload wird als eigenständiges Dokument abgelegt und getrennt verarbeitet."
            types={['transcript', 'email', 'voice_memo']}
            documents={proposal.source_documents || []}
            onAdd={onAddDocument}
            onRemove={onRemoveDocument}
            disabled={saving}
          />
          <Separator />
          <SourceDocumentsPanel
            title="Zusätzliches Kundenbriefing (optional)"
            hint="Eigenständiger Kontext — fließt getrennt vom Erst-Input in die Angebotserstellung ein."
            types={['briefing']}
            documents={proposal.source_documents || []}
            onAdd={onAddDocument}
            onRemove={onRemoveDocument}
            disabled={saving}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Schritt 1b — Kundenkontext</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {CONTEXT_FIELDS.map(([key, label]) => (
              <div key={key}>
                <Label className="text-xs">{label}</Label>
                <Textarea
                  value={form[key]}
                  onChange={e => set(key, e.target.value)}
                  className={`mt-1 text-sm ${key === 'client_project_scope' ? 'min-h-[110px]' : 'min-h-[70px]'}`}
                />
              </div>
            ))}
          </div>
          <div>
            <Label className="text-xs">Manuelle Notizen (optional)</Label>
            <Textarea
              value={notes}
              onChange={e => onNotesChange(e.target.value)}
              placeholder="Zusätzliche eigene Notizen — Dokumente bitte oben als Anhang hinzufügen…"
              className="mt-1 min-h-[120px] text-sm"
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
    </div>
  );
}