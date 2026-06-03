import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { RefreshCw, ChevronRight } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import StepUpload from '@/components/masterImport/StepUpload';
import StepColumnMapping from '@/components/masterImport/StepColumnMapping';
import StepClassifyProjects from '@/components/billingReset/StepClassifyProjects';
import StepAlignProjects from '@/components/billingReset/StepAlignProjects';
import StepInvoiceSync from '@/components/billingReset/StepInvoiceSync';
import StepReconcile from '@/components/billingReset/StepReconcile';
import StepApplyReset from '@/components/billingReset/StepApplyReset';
import ResetReport from '@/components/billingReset/ResetReport';
import { applyColumnMapping } from '@/lib/masterImportUtils';

const STEPS = [
  { id: 'upload', label: 'Excel Upload' },
  { id: 'columns', label: 'Spalten' },
  { id: 'classify', label: 'Klassifizierung' },
  { id: 'align', label: 'Abgleich' },
  { id: 'sync', label: 'Rechnungen' },
  { id: 'reconcile', label: 'Finanzabgleich' },
  { id: 'apply', label: 'Anwenden' },
  { id: 'done', label: 'Bericht' },
];

export default function BillingDataReset() {
  const [step, setStep] = useState('upload');
  const [session, setSession] = useState(null);
  const [parseResult, setParseResult] = useState(null);
  const [excelRows, setExcelRows] = useState([]);
  const [classified, setClassified] = useState([]);
  const [alignActions, setAlignActions] = useState([]);
  const [syncResult, setSyncResult] = useState(null);
  const [reconciled, setReconciled] = useState([]);
  const [importLog, setImportLog] = useState([]);

  const { data: existingProjects = [] } = useQuery({
    queryKey: ['projects'], queryFn: () => base44.entities.LiquidityProject.list()
  });
  const { data: existingOrders = [] } = useQuery({
    queryKey: ['confirmedOrders'], queryFn: () => base44.entities.ConfirmedOrder.list()
  });
  const { data: existingInvoices = [] } = useQuery({
    queryKey: ['invoices'], queryFn: () => base44.entities.InvoiceRecord.list('-invoice_date', 500)
  });

  function handleParsed(result, sess) {
    setParseResult(result);
    setSession(sess);
    setStep('columns');
  }

  function handleColumnsConfirmed(mapping) {
    const rawRows = parseResult.parsed_rows.map(r => {
      if (r.raw_row_json) {
        try {
          const raw = JSON.parse(r.raw_row_json);
          if (Array.isArray(raw)) return raw;
          const maxIdx = Math.max(...Object.keys(raw).map(Number).filter(n => !isNaN(n)));
          if (maxIdx >= 0) {
            const arr = [];
            for (let i = 0; i <= maxIdx; i++) arr.push(raw[i] ?? null);
            return arr;
          }
        } catch (_) { /* fall through */ }
      }
      return parseResult.headers.map((_, idx) => {
        const colEntry = parseResult.column_mapping?.[idx];
        const field = colEntry?.field;
        return field ? r[field] ?? null : null;
      });
    });

    const remapped = applyColumnMapping(rawRows, mapping);
    setParseResult(prev => ({ ...prev, confirmed_rows: remapped }));
    setExcelRows(remapped.filter(r => r.customer_name_raw || r.project_name_raw));
    setStep('classify');
  }

  function handleClassified(cls) {
    setClassified(cls);
    setStep('align');
  }

  function handleAligned(actions) {
    setAlignActions(actions);
    setStep('sync');
  }

  function handleSyncDone(result) {
    setSyncResult(result);
    setStep('reconcile');
  }

  function handleReconciled(rec) {
    setReconciled(rec);
    setStep('apply');
  }

  function handleApplyDone(log) {
    setImportLog(log);
    setStep('done');
  }

  function reset() {
    setStep('upload'); setParseResult(null); setSession(null);
    setExcelRows([]); setClassified([]); setAlignActions([]);
    setSyncResult(null); setReconciled([]); setImportLog([]);
  }

  const currentStepIdx = STEPS.findIndex(s => s.id === step);
  const rows = parseResult?.confirmed_rows || parseResult?.parsed_rows || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Verrechnungsdaten bereinigen"
        subtitle="PM-Excel als operative Referenz · Rechnungen aus Verrechnungssystem · Archivierung irrelevanter Daten"
        icon={RefreshCw}
      />

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">Wahrheitsquellen-Hierarchie</p>
        <div className="flex flex-wrap gap-4 mt-1 text-xs">
          <span>1. <strong>PM-Excel</strong> = aktive Projektliste & Abrechnungsplanung</span>
          <span>2. <strong>sevDesk</strong> = ausgestellte Rechnungen & Zahlungsstatus</span>
          <span>3. <strong>App-Daten</strong> = historische Daten → werden abgeglichen, nie gelöscht</span>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const past = i < currentStepIdx;
          const active = s.id === step;
          return (
            <React.Fragment key={s.id}>
              <div className={`flex items-center gap-1 flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${
                active ? 'bg-primary text-primary-foreground' :
                past ? 'bg-emerald-100 text-emerald-700' :
                'bg-muted text-muted-foreground'}`}>
                {past && <span>✓</span>}
                {i + 1}. {s.label}
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step content */}
      <div className="bg-card border rounded-xl p-6">
        {step === 'upload' && <StepUpload onParsed={handleParsed} onSessionCreated={setSession} />}
        {step === 'columns' && parseResult && <StepColumnMapping parseResult={parseResult} onConfirm={handleColumnsConfirmed} />}
        {step === 'classify' && (
          <StepClassifyProjects
            excelRows={excelRows}
            existingProjects={existingProjects}
            existingInvoices={existingInvoices}
            existingOrders={existingOrders}
            onConfirm={handleClassified}
          />
        )}
        {step === 'align' && (
          <StepAlignProjects
            classified={classified}
            existingProjects={existingProjects}
            onConfirm={handleAligned}
          />
        )}
        {step === 'sync' && <StepInvoiceSync onConfirm={handleSyncDone} />}
        {step === 'reconcile' && (
          <StepReconcile
            classifiedRows={classified}
            existingInvoices={existingInvoices}
            existingOrders={existingOrders}
            onConfirm={handleReconciled}
          />
        )}
        {step === 'apply' && (
          <StepApplyReset
            classified={classified}
            alignActions={alignActions}
            reconciled={reconciled}
            session={session}
            onComplete={handleApplyDone}
          />
        )}
        {step === 'done' && (
          <div className="space-y-6">
            <ResetReport log={importLog} classified={classified} reconciled={reconciled} activeRows={excelRows} />
            <button onClick={reset} className="text-sm text-primary underline">Neuen Reset starten</button>
          </div>
        )}
      </div>
    </div>
  );
}