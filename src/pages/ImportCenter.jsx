import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import ImportPreview from '@/components/import/ImportPreview';

const DEDICATED_IMPORTERS = [
  { 
    label: 'Projekte 2026', 
    entity: 'LiquidityProject', 
    icon: '📁', 
    fn: 'importProjekte2026',
    description: 'Importiert alle 81 Projekte mit Gesamtbetrag, offenem Betrag und monatlichen IST/SOLL-Werten'
  },
  {
    label: 'Toolkosten 2026',
    entity: 'ToolCost',
    icon: '💳',
    fn: 'importToolkosten2026',
    description: 'Importiert alle Software-Tools mit Jahres-/Monatskosten, Abteilung, Zahlungsintervall und Status'
  },
];

const SHEET_MAPPINGS = [
  { sheet: 'Projekte 2026', entity: 'LiquidityProject', icon: '📁' },
  { sheet: 'OM- Laufende Umsetzung 2026', entity: 'RecurringContract', icon: '📣' },
  { sheet: 'Wartungsverträge 2026', entity: 'RecurringContract', icon: '🛡️' },
  { sheet: 'Produktion & Support 2026', entity: 'LiquidityPlanLine', icon: '🔧' },
  { sheet: 'TOOLKOSTEN 2026', entity: 'ToolCost', icon: '💳' },
  { sheet: 'Mahnliste', entity: 'Receivable', icon: '⚠️' },
  { sheet: 'N_Mahnliste', entity: 'Receivable', icon: '⚠️' },
  { sheet: 'Eingangsrechnungen laufend', entity: 'Payable', icon: '📄' },
  { sheet: 'Forecast', entity: 'CashScenario', icon: '📈' },
];

export default function ImportCenter() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState(null);
  const [extractedData, setExtractedData] = useState(null);
  const [selectedSheet, setSelectedSheet] = useState(null);
  const [importStatus, setImportStatus] = useState({});
  const [dedicatedStatus, setDedicatedStatus] = useState({});
  const queryClient = useQueryClient();

  const handleFileSelect = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setUploading(true);
    setExtractedData(null);
    setSelectedSheet(null);

    const { file_url } = await base44.integrations.Core.UploadFile({ file: f });
    setUploadedUrl(file_url);
    setUploading(false);
  };

  const extractSheet = async (sheetName, entityName) => {
    setSelectedSheet(sheetName);
    setImportStatus(s => ({ ...s, [sheetName]: 'extracting' }));

    const schemaMap = {
      LiquidityProject: {
        type: 'object', properties: {
          items: { type: 'array', items: { type: 'object', properties: {
            customer: { type: 'string' }, project_name: { type: 'string' }, project_manager: { type: 'string' },
            total_net_amount: { type: 'number' }, already_invoiced_amount: { type: 'number' }, open_amount: { type: 'number' },
            notes: { type: 'string' }, status: { type: 'string' }, order_number: { type: 'string' }
          }}}
        }
      },
      RecurringContract: {
        type: 'object', properties: {
          items: { type: 'array', items: { type: 'object', properties: {
            customer: { type: 'string' }, project_name: { type: 'string' }, project_manager: { type: 'string' },
            monthly_fixed_price: { type: 'number' }, annual_amount: { type: 'number' }, one_time_payment: { type: 'number' },
            billing_interval: { type: 'string' }, start_date: { type: 'string' }, notes: { type: 'string' }, status: { type: 'string' }
          }}}
        }
      },
      ToolCost: {
        type: 'object', properties: {
          items: { type: 'array', items: { type: 'object', properties: {
            tool_name: { type: 'string' }, department: { type: 'string' }, annual_cost: { type: 'number' },
            monthly_cost: { type: 'number' }, payment_status: { type: 'string' }, payment_interval: { type: 'string' },
            needed: { type: 'boolean' }, customer_recharge: { type: 'string' }, info: { type: 'string' }
          }}}
        }
      },
      Receivable: {
        type: 'object', properties: {
          items: { type: 'array', items: { type: 'object', properties: {
            customer: { type: 'string' }, invoice_number: { type: 'string' }, invoice_date: { type: 'string' },
            gross_amount: { type: 'number' }, net_amount: { type: 'number' }, due_date: { type: 'string' },
            dunning_level: { type: 'number' }, remarks: { type: 'string' }, status: { type: 'string' }
          }}}
        }
      },
      Payable: {
        type: 'object', properties: {
          items: { type: 'array', items: { type: 'object', properties: {
            supplier: { type: 'string' }, invoice_number: { type: 'string' }, invoice_date: { type: 'string' },
            description: { type: 'string' }, net_amount: { type: 'number' }, gross_amount: { type: 'number' },
            due_date: { type: 'string' }, status: { type: 'string' }
          }}}
        }
      },
      LiquidityPlanLine: {
        type: 'object', properties: {
          items: { type: 'array', items: { type: 'object', properties: {
            customer_or_supplier: { type: 'string' }, title: { type: 'string' }, category: { type: 'string' },
            amount_net: { type: 'number' }, month: { type: 'string' }, direction: { type: 'string' },
            status: { type: 'string' }, notes: { type: 'string' }
          }}}
        }
      },
      CashScenario: {
        type: 'object', properties: {
          items: { type: 'array', items: { type: 'object', properties: {
            scenario_name: { type: 'string' }, description: { type: 'string' }
          }}}
        }
      },
    };

    let result;
    try {
      result = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url: uploadedUrl,
        sheet_name: sheetName,
        json_schema: schemaMap[entityName] || schemaMap.LiquidityProject
      });
    } catch (err) {
      setImportStatus(s => ({ ...s, [sheetName]: 'error' }));
      setExtractedData({ sheet: sheetName, entity: entityName, rows: [], error: err?.message || 'Unbekannter Fehler' });
      return;
    }

    if (result.status === 'success' && result.output?.items?.length > 0) {
      setExtractedData({ sheet: sheetName, entity: entityName, rows: result.output.items });
      setImportStatus(s => ({ ...s, [sheetName]: 'preview' }));
    } else if (result.status === 'success' && Array.isArray(result.output) && result.output.length > 0) {
      // Some schemas return array directly
      setExtractedData({ sheet: sheetName, entity: entityName, rows: result.output });
      setImportStatus(s => ({ ...s, [sheetName]: 'preview' }));
    } else {
      setImportStatus(s => ({ ...s, [sheetName]: 'error' }));
      setExtractedData({ sheet: sheetName, entity: entityName, rows: [], error: result.details || 'Keine Daten gefunden oder Sheet-Name stimmt nicht überein.' });
    }
  };

  const commitImport = async (rows, entityName, sheetName) => {
    setImportStatus(s => ({ ...s, [sheetName]: 'importing' }));
    const batchId = `import_${Date.now()}`;
    const enriched = rows.map(r => ({ ...r, source_sheet: sheetName, import_batch_id: batchId }));

    // Add contract_type for recurring contracts
    if (entityName === 'RecurringContract') {
      enriched.forEach(r => {
        if (sheetName.includes('OM')) r.contract_type = 'online_marketing';
        else if (sheetName.includes('Wartung')) r.contract_type = 'maintenance';
        else r.contract_type = 'other';
      });
    }

    await base44.entities[entityName].bulkCreate(enriched);
    await base44.entities.AuditLog.create({
      action: 'import', entity_type: entityName, details: `Imported ${rows.length} rows from ${sheetName}`, import_batch_id: batchId
    });

    setImportStatus(s => ({ ...s, [sheetName]: 'done' }));
    queryClient.invalidateQueries();
    setExtractedData(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Import Center" subtitle="Excel-Daten importieren und zuordnen" icon={Upload} />

      <Card>
        <CardHeader><CardTitle className="text-base">Excel Workbook hochladen</CardTitle></CardHeader>
        <CardContent>
          <div className="border-2 border-dashed rounded-xl p-8 text-center">
            <FileSpreadsheet className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">Excel-Datei (.xlsx) hier auswählen</p>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} className="hidden" id="file-upload" />
            <label htmlFor="file-upload">
              <Button asChild variant={uploading ? 'secondary' : 'default'} disabled={uploading}>
                <span>{uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Wird hochgeladen...</> : 'Datei auswählen'}</span>
              </Button>
            </label>
            {file && <p className="text-sm mt-3 font-medium">{file.name}</p>}
          </div>
        </CardContent>
      </Card>

      {uploadedUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Direktimporter (empfohlen)</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Speziell angepasste Parser für eure Excel-Struktur</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {DEDICATED_IMPORTERS.map(imp => (
                <div key={imp.fn} className="flex items-center justify-between p-4 border rounded-xl bg-primary/5 border-primary/20">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{imp.icon}</span>
                    <div>
                      <p className="text-sm font-medium">{imp.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{imp.description}</p>
                    </div>
                  </div>
                  <div className="flex-shrink-0 ml-4">
                    {dedicatedStatus[imp.fn] === 'done' ? (
                      <Badge className="bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3 mr-1" />Importiert</Badge>
                    ) : dedicatedStatus[imp.fn] === 'loading' ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    ) : dedicatedStatus[imp.fn]?.startsWith?.('error') ? (
                      <Badge className="bg-red-100 text-red-700 max-w-48 truncate">{dedicatedStatus[imp.fn]}</Badge>
                    ) : (
                      <Button size="sm" onClick={async () => {
                        setDedicatedStatus(s => ({ ...s, [imp.fn]: 'loading' }));
                        try {
                          const res = await base44.functions.invoke(imp.fn, { file_url: uploadedUrl });
                          setDedicatedStatus(s => ({ ...s, [imp.fn]: 'done' }));
                          queryClient.invalidateQueries();
                        } catch (e) {
                          setDedicatedStatus(s => ({ ...s, [imp.fn]: `error: ${e.message}` }));
                        }
                      }}>Jetzt importieren</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {uploadedUrl && (
        <Card>
          <CardHeader><CardTitle className="text-base">Sheet-Zuordnung (KI-Extraktion)</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {SHEET_MAPPINGS.map(m => (
                <div key={m.sheet} className="flex items-center justify-between p-4 border rounded-xl hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{m.icon}</span>
                    <div>
                      <p className="text-sm font-medium">{m.sheet}</p>
                      <p className="text-xs text-muted-foreground">→ {m.entity}</p>
                    </div>
                  </div>
                  {importStatus[m.sheet] === 'done' ? (
                    <Badge className="bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3 mr-1" />Importiert</Badge>
                  ) : importStatus[m.sheet] === 'extracting' || importStatus[m.sheet] === 'importing' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  ) : importStatus[m.sheet] === 'error' ? (
                    <Badge className="bg-red-100 text-red-700"><AlertCircle className="w-3 h-3 mr-1" />Fehler</Badge>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => extractSheet(m.sheet, m.entity)}>Extrahieren</Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {extractedData && extractedData.error && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>
            <strong>Fehler beim Extrahieren von „{extractedData.sheet}":</strong> {extractedData.error}
            <br /><span className="text-xs mt-1 block">Tipp: Stelle sicher, dass der Sheet-Name exakt übereinstimmt (Groß-/Kleinschreibung beachten).</span>
          </AlertDescription>
        </Alert>
      )}
      {extractedData && !extractedData.error && (
        <ImportPreview
          data={extractedData}
          onCommit={(rows) => commitImport(rows, extractedData.entity, extractedData.sheet)}
          onCancel={() => setExtractedData(null)}
        />
      )}
    </div>
  );
}