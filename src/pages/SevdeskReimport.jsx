import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle, CheckCircle2, RefreshCw, Trash2, Download,
  FileText, ArrowRight, Info, RotateCcw
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

const STEPS = [
  { id: 'status', label: '1. Audit — Ist-Zustand', icon: FileText },
  { id: 'reset_orders', label: '2. ABs löschen', icon: Trash2 },
  { id: 'reset_invoices', label: '3. Rechnungen löschen', icon: Trash2 },
  { id: 'import_orders', label: '4. ABs 2025/2026 importieren', icon: Download },
  { id: 'import_invoices', label: '5. Rechnungen importieren', icon: Download },
];

function StepCard({ step, status, result, onRun, isLoading, isActive }) {
  const Icon = step.icon;
  const isDone = status === 'done';
  const isError = status === 'error';

  return (
    <Card className={`border-2 transition-all ${isActive ? 'border-primary shadow-md' : isDone ? 'border-emerald-400' : 'border-border'}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${isDone ? 'bg-emerald-100' : isActive ? 'bg-primary/10' : 'bg-muted'}`}>
            <Icon className={`w-4 h-4 ${isDone ? 'text-emerald-600' : isActive ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          {step.label}
          {isDone && <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto" />}
          {isError && <AlertTriangle className="w-4 h-4 text-red-500 ml-auto" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {result && (
          <div className={`text-xs rounded-lg p-3 font-mono whitespace-pre-wrap ${isError ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-muted text-muted-foreground'}`}>
            {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
          </div>
        )}
        {isActive && (
          <Button
            size="sm"
            onClick={onRun}
            disabled={isLoading}
            className="w-full"
            variant={step.id.startsWith('reset') ? 'destructive' : 'default'}
          >
            {isLoading ? (
              <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Läuft…</>
            ) : step.id.startsWith('reset') ? (
              <><Trash2 className="w-4 h-4 mr-2" />Jetzt löschen</>
            ) : step.id === 'status' ? (
              <><FileText className="w-4 h-4 mr-2" />Audit starten</>
            ) : (
              <><Download className="w-4 h-4 mr-2" />Import starten</>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function SevdeskReimport() {
  const [currentStep, setCurrentStep] = useState(0);
  const [stepStatuses, setStepStatuses] = useState({});
  const [stepResults, setStepResults] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [confirmReset, setConfirmReset] = useState(null);

  const runStep = async (stepId) => {
    // For destructive steps, require confirmation
    if (stepId.startsWith('reset') && confirmReset !== stepId) {
      setConfirmReset(stepId);
      return;
    }
    setConfirmReset(null);
    setIsLoading(true);
    try {
      const res = await base44.functions.invoke('resetAndResyncSevdesk', { action: stepId });
      const data = res.data;

      setStepStatuses(prev => ({ ...prev, [stepId]: 'done' }));

      // Build readable summary
      let summary = data.message || JSON.stringify(data);
      if (stepId === 'status') {
        summary = [
          `📋 Auftragsbestätigungen gesamt: ${data.total_orders}`,
          ...Object.entries(data.orders_by_year || {}).map(([y, c]) => `   ${y}: ${c} ABs`),
          `🧾 Rechnungen gesamt: ${data.total_invoices}`,
          ...Object.entries(data.invoices_by_year || {}).map(([y, c]) => `   ${y}: ${c} Rechnungen`),
        ].join('\n');
      }

      setStepResults(prev => ({ ...prev, [stepId]: summary }));
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
    } catch (e) {
      setStepStatuses(prev => ({ ...prev, [stepId]: 'error' }));
      setStepResults(prev => ({ ...prev, [stepId]: `Fehler: ${e.message}` }));
    }
    setIsLoading(false);
  };

  const reset = () => {
    setCurrentStep(0);
    setStepStatuses({});
    setStepResults({});
    setConfirmReset(null);
  };

  const isDone = currentStep >= STEPS.length && Object.values(stepStatuses).every(s => s === 'done');

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <PageHeader
        title="sevDesk Re-Import"
        subtitle="Audit → Reset → Neu-Import (nur ABs 2025 & 2026)"
        icon={RotateCcw}
        actions={
          currentStep > 0 && (
            <Button variant="outline" size="sm" onClick={reset}>
              <RotateCcw className="w-4 h-4 mr-1.5" /> Neu starten
            </Button>
          )
        }
      />

      {/* Warning banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border-2 border-amber-300">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Dieser Prozess ist destruktiv</p>
          <p className="text-xs text-amber-700 mt-1">
            Schritt 2 löscht <strong>alle</strong> Auftragsbestätigungen, Schritt 3 alle Rechnungen.
            Danach werden nur ABs mit Datum 2025 und 2026 aus sevDesk neu importiert,
            gefolgt von allen zugehörigen Rechnungen — unabhängig von deren Datum.
          </p>
        </div>
      </div>

      {/* Flow info */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
        <Info className="w-3.5 h-3.5 flex-shrink-0" />
        Rechnungen werden direkt per sevDesk-Auftrags-ID abgefragt — kein Datums-Filter, vollständige Zuordnung garantiert.
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {STEPS.map((step, idx) => (
          <div key={step.id}>
            {confirmReset === step.id && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-300 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-800 flex-1">
                  Wirklich alle {step.id === 'reset_orders' ? 'Auftragsbestätigungen' : 'Rechnungen'} löschen?
                </p>
                <Button size="sm" variant="destructive" onClick={() => runStep(step.id)} disabled={isLoading}>
                  Ja, löschen
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmReset(null)}>
                  Abbrechen
                </Button>
              </div>
            )}
            <StepCard
              step={step}
              status={stepStatuses[step.id]}
              result={stepResults[step.id]}
              isActive={idx === currentStep}
              isLoading={isLoading && idx === currentStep}
              onRun={() => runStep(step.id)}
            />
          </div>
        ))}
      </div>

      {isDone && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 border-2 border-emerald-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">Re-Import abgeschlossen</p>
            <p className="text-xs text-emerald-700 mt-0.5">Alle ABs 2025/2026 und ihre Rechnungen wurden importiert.</p>
          </div>
        </div>
      )}
    </div>
  );
}