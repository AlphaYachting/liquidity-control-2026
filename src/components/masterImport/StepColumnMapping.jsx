import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const FIELD_OPTIONS = [
  { value: '', label: '— Nicht zuordnen —' },
  { value: 'customer_name_raw', label: 'Kundenname' },
  { value: 'project_name_raw', label: 'Projektname' },
  { value: 'project_manager', label: 'Projektmanager' },
  { value: 'project_status', label: 'Projektstatus' },
  { value: 'billing_status', label: 'Abrechnungsstatus' },
  { value: 'total_order_amount_net', label: 'Auftragssumme netto' },
  { value: 'already_invoiced_net', label: 'Bereits verrechnet netto' },
  { value: 'already_invoiced_percent', label: 'Bereits verrechnet %' },
  { value: 'open_amount_net', label: 'Offener Betrag netto' },
  { value: 'open_percent', label: 'Offener Betrag %' },
  { value: 'expected_current_month_amount_net', label: 'Erwartung aktueller Monat netto' },
  { value: 'expected_next_month_amount_net', label: 'Erwartung nächster Monat netto' },
  { value: 'risk_status', label: 'Risiko-Status' },
  { value: 'notes', label: 'Notizen' },
  { value: 'next_invoice_note', label: 'Hinweis nächste Rechnung' },
];

export default function StepColumnMapping({ parseResult, onConfirm }) {
  const [mapping, setMapping] = useState(() => {
    const initial = {};
    Object.entries(parseResult.column_mapping || {}).forEach(([idx, { field }]) => {
      initial[idx] = field || '';
    });
    return initial;
  });

  const mappedFields = Object.values(mapping).filter(Boolean);
  const hasCustomer = mappedFields.includes('customer_name_raw');
  const hasProject = mappedFields.includes('project_name_raw');

  const previewRows = (parseResult.parsed_rows || []).slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Schritt 2: Spalten überprüfen & bestätigen</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Die Spalten wurden automatisch erkannt. Überprüfe und korrigiere die Zuordnung falls nötig.
        </p>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{parseResult.target_sheet}</span>
        <span>·</span>
        <span>{parseResult.total_rows} Datenzeilen</span>
        <span>·</span>
        <span>{parseResult.headers?.length} Spalten</span>
      </div>

      {(!hasCustomer || !hasProject) && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {!hasCustomer && !hasProject ? 'Kundenname und Projektname müssen zugeordnet werden.' :
           !hasCustomer ? 'Bitte weise eine Spalte als "Kundenname" zu.' :
           'Bitte weise eine Spalte als "Projektname" zu.'}
        </div>
      )}

      {/* Column mapping table */}
      <div className="border rounded-xl overflow-hidden">
        <div className="grid grid-cols-3 gap-0 bg-muted px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Spalte in Excel</span>
          <span>Beispielwert</span>
          <span>Zugeordnetes Feld</span>
        </div>
        <div className="divide-y">
          {(parseResult.headers || []).map((header, idx) => {
            const exampleVal = (parseResult.parsed_rows || []).slice(0, 3)
              .map(r => Object.values(r)[idx + 1]).find(v => v != null && v !== '');
            const isMapped = !!mapping[idx];
            return (
              <div key={idx} className={`grid grid-cols-3 gap-4 px-4 py-2.5 items-center text-sm ${isMapped ? 'bg-emerald-50/40' : ''}`}>
                <div className="flex items-center gap-2">
                  {isMapped
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    : <span className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />}
                  <span className="font-medium truncate">{header || `Spalte ${idx + 1}`}</span>
                </div>
                <span className="text-muted-foreground text-xs truncate">{String(exampleVal ?? '—')}</span>
                <Select value={mapping[idx] || ''} onValueChange={v => setMapping(prev => ({ ...prev, [idx]: v }))}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="Nicht zuordnen" />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      </div>

      {/* Preview */}
      {previewRows.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Vorschau (erste 5 Zeilen nach aktueller Zuordnung)</p>
          <div className="border rounded-xl overflow-auto text-xs">
            <table className="min-w-full">
              <thead className="bg-muted">
                <tr>
                  {['Kunde', 'Projekt', 'PM', 'Auftrag netto', 'Verrechnet', 'Offen'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {previewRows.map((row, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">{row.customer_name_raw || '—'}</td>
                    <td className="px-3 py-2">{row.project_name_raw || '—'}</td>
                    <td className="px-3 py-2">{row.project_manager || '—'}</td>
                    <td className="px-3 py-2">{row.total_order_amount_net != null ? `€${row.total_order_amount_net}` : '—'}</td>
                    <td className="px-3 py-2">{row.already_invoiced_net != null ? `€${row.already_invoiced_net}` : '—'}</td>
                    <td className="px-3 py-2">{row.open_amount_net != null ? `€${row.open_amount_net}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Button
        disabled={!hasCustomer && !hasProject}
        onClick={() => onConfirm(mapping)}
        className="gap-2"
      >
        Spalten bestätigen & weiter
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}