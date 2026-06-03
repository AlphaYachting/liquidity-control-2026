import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { DatabaseZap, ChevronRight } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import StepUpload from '@/components/masterImport/StepUpload';
import StepColumnMapping from '@/components/masterImport/StepColumnMapping';
import StepActiveDetection from '@/components/masterImport/StepActiveDetection';
import StepMatchingReview from '@/components/masterImport/StepMatchingReview';
import StepApplyActions from '@/components/masterImport/StepApplyActions';
import DataQualityDashboard from '@/components/masterImport/DataQualityDashboard';
import { applyColumnMapping } from '@/lib/masterImportUtils';

const STEPS = [
  { id: 'upload', label: 'Upload' },
  { id: 'columns', label: 'Spalten' },
  { id: 'active', label: 'Aktive Projekte' },
  { id: 'review', label: 'Abgleich' },
  { id: 'apply', label: 'Import' },
  { id: 'done', label: 'Bericht' },
];

export default function MasterDataImport() {
  const [step, setStep] = useState('upload');
  const [session, setSession] = useState(null);
  const [parseResult, setParseResult] = useState(null);
  const [activeRows, setActiveRows] = useState([]);
  const [decisions, setDecisions] = useState({});
  const [importLog, setImportLog] = useState([]);

  // Load existing data for matching
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
    // Re-map raw rows using user-confirmed column mapping
    const remapped = applyColumnMapping(
      parseResult.parsed_rows.map(r => {
        // Reconstruct raw array from headers
        return parseResult.headers.map((_, idx) => {
          const colKey = Object.entries(parseResult.column_mapping).find(([i]) => parseInt(i) === idx);
          const origField = colKey?.[1]?.field;
          return origField ? r[origField] : null;
        });
      }),
      mapping
    );
    setParseResult(prev => ({ ...prev, confirmed_rows: remapped, confirmed_mapping: mapping }));
    setStep('active');
  }

  function handleActiveConfirmed(rows) {
    setActiveRows(rows.filter(r => r.is_active_project));
    setStep('review');
  }

  function handleReviewConfirmed(decs) {
    setDecisions(decs);
    setStep('apply');
  }

  function handleImportComplete(log) {
    setImportLog(log);
    setStep('done');
  }

  const currentStepIdx = STEPS.findIndex(s => s.id === step);
  const rowsToProcess = (parseResult?.confirmed_rows || parseResult?.parsed_rows || []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Master-Datenimport"
        subtitle="Projektliste importieren, abgleichen und verknüpfen"
        icon={DatabaseZap}
      />

      <DataQualityDashboard />

      {/* Step indicator */}
      <div className="flex items-center gap-1 overflow-x-auto">
        {STEPS.map((s, i) => {
          const past = i < currentStepIdx;
          const active = s.id === step;
          return (
            <React.Fragment key={s.id}>
              <div className={`flex items-center gap-1.5 flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                active ? 'bg-primary text-primary-foreground' :
                past ? 'bg-emerald-100 text-emerald-700' :
                'bg-muted text-muted-foreground'
              }`}>
                {past && <span className="text-emerald-500">✓</span>}
                {i + 1}. {s.label}
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step content */}
      <div className="bg-card border rounded-xl p-6">
        {step === 'upload' && (
          <StepUpload onParsed={handleParsed} onSessionCreated={setSession} />
        )}
        {step === 'columns' && parseResult && (
          <StepColumnMapping parseResult={parseResult} onConfirm={handleColumnsConfirmed} />
        )}
        {step === 'active' && (
          <StepActiveDetection rows={rowsToProcess} onConfirm={handleActiveConfirmed} />
        )}
        {step === 'review' && (
          <StepMatchingReview
            rows={activeRows}
            existingProjects={existingProjects}
            existingOrders={existingOrders}
            existingInvoices={existingInvoices}
            onConfirm={handleReviewConfirmed}
          />
        )}
        {step === 'apply' && (
          <StepApplyActions
            rows={activeRows}
            decisions={decisions}
            session={session}
            existingProjects={existingProjects}
            existingOrders={existingOrders}
            onComplete={handleImportComplete}
          />
        )}
        {step === 'done' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Import abgeschlossen</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              {[
                { label: 'Aktionen gesamt', value: importLog.length },
                { label: 'Erfolgreich', value: importLog.filter(r => r.status === 'ok').length },
                { label: 'Fehler', value: importLog.filter(r => r.status === 'error').length },
                { label: 'Aktive Projekte', value: activeRows.length },
              ].map(k => (
                <div key={k.label} className="border rounded-xl p-4">
                  <p className="text-2xl font-bold">{k.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
                </div>
              ))}
            </div>

            {importLog.filter(r => r.status === 'error').length > 0 && (
              <div>
                <p className="text-sm font-medium text-red-700 mb-2">Fehlgeschlagene Aktionen:</p>
                <div className="space-y-1">
                  {importLog.filter(r => r.status === 'error').map((r, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      <span className="flex-1">{r.label}</span>
                      <span className="text-xs">{r.note}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => { setStep('upload'); setParseResult(null); setSession(null); setActiveRows([]); setDecisions({}); setImportLog([]); }}
              className="text-sm text-primary underline"
            >
              Neuen Import starten
            </button>
          </div>
        )}
      </div>
    </div>
  );
}