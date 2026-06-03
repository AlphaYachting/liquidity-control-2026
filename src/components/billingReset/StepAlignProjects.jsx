import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/masterImportUtils';

function DiffRow({ label, excelVal, appVal, isAmount }) {
  const isDiff = isAmount
    ? Math.abs((excelVal || 0) - (appVal || 0)) > 1
    : String(excelVal || '') !== String(appVal || '');
  if (!isDiff && !excelVal && !appVal) return null;
  return (
    <div className={`flex items-center gap-2 text-xs py-1 px-2 rounded ${isDiff ? 'bg-amber-50 border border-amber-200' : 'bg-muted/30'}`}>
      <span className="text-muted-foreground w-36 flex-shrink-0">{label}</span>
      <span className="line-through text-red-500/70">{isAmount ? formatCurrency(appVal) : (appVal || '—')}</span>
      <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
      <span className={isDiff ? 'font-semibold text-emerald-700' : ''}>{isAmount ? formatCurrency(excelVal) : (excelVal || '—')}</span>
    </div>
  );
}

export default function StepAlignProjects({ classified, existingProjects, onConfirm }) {
  const [selected, setSelected] = useState(() => {
    const init = {};
    classified.filter(c => ['active_billing_relevant', 'future_billing_relevant'].includes(c.effectiveRelevance) && c.row)
      .forEach(c => { init[c.row.row_number] = true; });
    return init;
  });
  const [expanded, setExpanded] = useState({});

  const applicableRows = useMemo(() =>
    classified.filter(c =>
      ['active_billing_relevant', 'future_billing_relevant'].includes(c.effectiveRelevance) && c.row
    ), [classified]
  );

  function buildDiffs(c) {
    const proj = c.matchedProject;
    if (!proj) return [];
    const row = c.row;
    const diffs = [];
    if (Math.abs((row.total_order_amount_net || 0) - (proj.total_net_amount || 0)) > 1) diffs.push({ label: 'Auftragssumme', excel: row.total_order_amount_net, app: proj.total_net_amount, isAmount: true });
    if (Math.abs((row.open_amount_net || 0) - (proj.open_amount || 0)) > 1) diffs.push({ label: 'Offener Betrag', excel: row.open_amount_net, app: proj.open_amount, isAmount: true });
    if (Math.abs((row.already_invoiced_net || 0) - (proj.already_invoiced_amount || 0)) > 1) diffs.push({ label: 'Bereits verrechnet', excel: row.already_invoiced_net, app: proj.already_invoiced_amount, isAmount: true });
    if (row.notes_next_invoice && row.notes_next_invoice !== proj.notes_next_invoice) diffs.push({ label: 'Abrechnungshinweis', excel: row.notes_next_invoice, app: proj.notes_next_invoice, isAmount: false });
    if (row.project_manager && row.project_manager !== proj.project_manager) diffs.push({ label: 'Projektmanager', excel: row.project_manager, app: proj.project_manager, isAmount: false });
    return diffs;
  }

  function handleConfirm() {
    const actions = applicableRows
      .filter(c => selected[c.row.row_number])
      .map(c => ({
        ...c,
        diffs: buildDiffs(c),
        action: c.matchedProject ? 'update' : 'create',
      }));
    onConfirm(actions);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Schritt 4: Projekte mit Excel abgleichen</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Vorher/Nachher-Vergleich für jede aktive Excel-Zeile. Wähle welche Projekte aktualisiert werden sollen.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button className="text-xs text-primary underline" onClick={() => setSelected(Object.fromEntries(applicableRows.map(c => [c.row.row_number, true])))}>Alle auswählen</button>
        <button className="text-xs text-muted-foreground underline" onClick={() => setSelected({})}>Alle abwählen</button>
        <span className="ml-auto text-xs text-muted-foreground">{Object.values(selected).filter(Boolean).length} / {applicableRows.length} ausgewählt</span>
      </div>

      <div className="border rounded-xl overflow-hidden divide-y">
        {applicableRows.map((c, i) => {
          const key = c.row.row_number;
          const diffs = buildDiffs(c);
          const hasDiffs = diffs.length > 0;
          const isExpanded = expanded[key];
          return (
            <div key={i} className={!selected[key] ? 'opacity-50' : ''}>
              <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20">
                <input type="checkbox" checked={!!selected[key]} onChange={e => setSelected(prev => ({ ...prev, [key]: e.target.checked }))} className="rounded" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{c.row.project_name_raw || '—'}</p>
                    {c.matchedProject
                      ? <span className="text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Match {Math.round(c.matchSim * 100)}%</span>
                      : <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Neu anlegen</span>}
                    {hasDiffs && <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{diffs.length} Änderung{diffs.length !== 1 ? 'en' : ''}</span>}
                    {!hasDiffs && c.matchedProject && <span className="text-xs text-muted-foreground">Keine Änderungen</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{c.row.customer_name_normalized || '—'}</p>
                </div>
                <div className="text-right text-xs flex-shrink-0">
                  <p className="font-medium">{formatCurrency(c.row.total_order_amount_net)}</p>
                  <p className="text-amber-600">Offen: {formatCurrency(c.row.open_amount_net)}</p>
                </div>
                {hasDiffs && (
                  <button onClick={() => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))} className="p-1 hover:bg-muted rounded">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                )}
              </div>
              {isExpanded && hasDiffs && (
                <div className="px-10 pb-3 space-y-1.5">
                  {diffs.map((d, j) => <DiffRow key={j} label={d.label} excelVal={d.excel} appVal={d.app} isAmount={d.isAmount} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Button onClick={handleConfirm} className="gap-2">
        Abgleich vorbereiten & weiter
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}