import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertTriangle, Shield, Download, Trash2, CheckCircle2,
  Loader2, ChevronRight, Database, FileText, ArrowRight
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

// Entities to backup & clear
const CLEAR_ENTITIES = [
  { name: 'LiquidityProject', label: 'Projekte (Cockpit)', group: 'core' },
  { name: 'ConfirmedOrder', label: 'Auftragsbestätigungen', group: 'core' },
  { name: 'ConfirmedOrderItem', label: 'Auftragspositionen', group: 'core' },
  { name: 'ProjectBillingBlock', label: 'Abrechnungsblöcke', group: 'core' },
  { name: 'MonthlyBillingPlan', label: 'Monatsplanung', group: 'core' },
  { name: 'BillingInstruction', label: 'Abrechnungsanweisungen', group: 'core' },
  { name: 'InvoiceRecord', label: 'Rechnungseinträge', group: 'core' },
  { name: 'Receivable', label: 'Offene Forderungen', group: 'finance' },
  { name: 'Payable', label: 'Eingangsrechnungen', group: 'finance' },
  { name: 'LiquidityPlanLine', label: 'Liquiditätsplanzeilen', group: 'finance' },
  { name: 'MasterImportSession', label: 'Import-Sessions', group: 'import' },
  { name: 'MasterImportRow', label: 'Import-Zeilen', group: 'import' },
  { name: 'AworkProjectSnapshot', label: 'awork Projekt-Snapshots', group: 'awork' },
  { name: 'AworkTaskSnapshot', label: 'awork Task-Snapshots', group: 'awork' },
  { name: 'AworkTimeEntry', label: 'awork Zeiteinträge', group: 'awork' },
  { name: 'AworkSyncLog', label: 'awork Sync-Logs', group: 'awork' },
];

const OPTIONAL_ENTITIES = [
  { name: 'ToolCost', label: 'Toolkosten', keepKey: 'keepToolCost', default: true },
  { name: 'RecurringContract', label: 'Wartungsverträge / Daueraufträge', keepKey: 'keepRecurringContract', default: true },
];

const GROUP_LABELS = {
  core: 'Kern-Betriebsdaten',
  finance: 'Planung & Finanzen',
  import: 'Import & Reconciliation',
  awork: 'awork Cache-Daten',
};

const CONFIRMATION_PHRASE = 'RESET LIQUIDITY CONTROL';

const STEPS = ['backup', 'confirm', 'reset', 'report'];

export default function OperationalReset() {
  const [step, setStep] = useState('backup');
  const [backupCounts, setBackupCounts] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupDone, setBackupDone] = useState(false);
  const [backupJson, setBackupJson] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [checks, setChecks] = useState({ understand: false, backup: false, irreversible: false });
  const [keepOptions, setKeepOptions] = useState({ keepToolCost: true, keepRecurringContract: true });
  const [resetLoading, setResetLoading] = useState(false);
  const [resetReport, setResetReport] = useState(null);
  const [resetError, setResetError] = useState(null);

  // STEP 1: Backup
  const runBackup = async () => {
    setBackupLoading(true);
    const counts = {};
    const backupData = {};
    const allEntities = [
      ...CLEAR_ENTITIES.map(e => e.name),
      ...OPTIONAL_ENTITIES.map(e => e.name),
    ];
    for (const entityName of allEntities) {
      try {
        const records = await base44.entities[entityName].list(undefined, 2000);
        counts[entityName] = records.length;
        backupData[entityName] = records;
      } catch {
        counts[entityName] = 0;
        backupData[entityName] = [];
      }
    }
    setBackupCounts(counts);
    setBackupJson(backupData);
    setBackupLoading(false);
    setBackupDone(true);
  };

  const downloadBackup = () => {
    if (!backupJson) return;
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data: backupJson }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `liquidity-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // STEP 3: Reset
  const runReset = async () => {
    setResetLoading(true);
    setResetError(null);
    const deletedCounts = {};
    const keptEntities = [];

    // Determine which optional entities to keep
    const entitiesToClear = [...CLEAR_ENTITIES];
    for (const opt of OPTIONAL_ENTITIES) {
      if (keepOptions[opt.keepKey]) {
        keptEntities.push(opt.label);
      } else {
        entitiesToClear.push(opt);
      }
    }

    for (const entity of entitiesToClear) {
      try {
        const records = await base44.entities[entity.name].list(undefined, 2000);
        let deleted = 0;
        for (const r of records) {
          await base44.entities[entity.name].delete(r.id);
          deleted++;
        }
        deletedCounts[entity.name] = deleted;
      } catch (e) {
        deletedCounts[entity.name] = `Fehler: ${e.message}`;
      }
    }

    const report = {
      timestamp: new Date().toISOString(),
      entitiesCleared: deletedCounts,
      entitiesKept: [
        'AworkIntegrationSetting', 'SefIntegrationSetting',
        ...OPTIONAL_ENTITIES.filter(o => keepOptions[o.keepKey]).map(o => o.label),
        'User accounts', 'API credentials', 'Entity schemas', 'UI components'
      ],
      backupStatus: backupDone ? 'Backup erstellt & herunterladbar' : 'Backup übersprungen',
    };

    setResetReport(report);
    setResetLoading(false);
    setStep('report');
  };

  const allChecked = checks.understand && checks.backup && checks.irreversible;
  const confirmOk = confirmText.trim() === CONFIRMATION_PHRASE && allChecked;

  const totalBackupRecords = backupCounts ? Object.values(backupCounts).reduce((a, b) => a + b, 0) : 0;
  const totalDeleted = resetReport ? Object.values(resetReport.entitiesCleared).reduce((a, b) => typeof b === 'number' ? a + b : a, 0) : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Operational Reset"
        subtitle="Bereinigung der operativen Datenbasis für Neustart"
        icon={Shield}
      />

      {/* Warning Banner */}
      <Alert className="border-red-300 bg-red-50">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <AlertDescription className="text-red-800 font-medium">
          Dieser Reset löscht operative Datensätze unwiderruflich. App-Struktur, Integrationen und Einstellungen bleiben erhalten.
          Nur verwenden, wenn die Datenbasis vollständig neu aufgebaut werden soll.
        </AlertDescription>
      </Alert>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 text-sm">
        {['Backup', 'Bestätigung', 'Reset', 'Report'].map((label, i) => {
          const s = STEPS[i];
          const active = step === s;
          const done = STEPS.indexOf(step) > i;
          return (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium transition-all
                ${active ? 'bg-primary text-white' : done ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="w-4 text-center">{i + 1}</span>}
                {label}
              </div>
              {i < 3 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── STEP 1: BACKUP ── */}
      {step === 'backup' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="w-4 h-4 text-primary" />
                Schritt 1: Backup der aktuellen Daten
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Bevor Daten gelöscht werden, wird eine vollständige Zusammenfassung aller operativen Datensätze erstellt.
                Der Reset kann erst nach Abschluss dieses Schritts fortgesetzt werden.
              </p>

              {!backupDone ? (
                <Button onClick={runBackup} disabled={backupLoading} className="gap-2">
                  {backupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                  {backupLoading ? 'Backup wird erstellt…' : 'Backup erstellen'}
                </Button>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-green-700 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    Backup abgeschlossen — {totalBackupRecords} Datensätze erfasst
                  </div>

                  {/* Count table grouped */}
                  {Object.entries(GROUP_LABELS).map(([group, groupLabel]) => {
                    const entities = CLEAR_ENTITIES.filter(e => e.group === group);
                    return (
                      <div key={group}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{groupLabel}</p>
                        <div className="grid grid-cols-2 gap-1">
                          {entities.map(e => (
                            <div key={e.name} className="flex justify-between items-center px-3 py-1.5 bg-muted rounded text-sm">
                              <span className="text-muted-foreground">{e.label}</span>
                              <Badge variant="secondary">{backupCounts?.[e.name] ?? '—'}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Optional (konfigurierbar)</p>
                    <div className="grid grid-cols-2 gap-1">
                      {OPTIONAL_ENTITIES.map(e => (
                        <div key={e.name} className="flex justify-between items-center px-3 py-1.5 bg-muted rounded text-sm">
                          <span className="text-muted-foreground">{e.label}</span>
                          <Badge variant="secondary">{backupCounts?.[e.name] ?? '—'}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" onClick={downloadBackup} className="gap-2">
                      <Download className="w-4 h-4" />
                      JSON-Backup herunterladen
                    </Button>
                    <Button onClick={() => setStep('confirm')} className="gap-2">
                      Weiter zur Bestätigung
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── STEP 2: CONFIRM ── */}
      {step === 'confirm' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              Schritt 2: Reset bestätigen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Optional entities */}
            <div>
              <p className="text-sm font-medium mb-3">Optionale Datensätze — was soll behalten werden?</p>
              <div className="space-y-2">
                {OPTIONAL_ENTITIES.map(opt => (
                  <div key={opt.keepKey} className="flex items-center gap-3">
                    <Checkbox
                      id={opt.keepKey}
                      checked={keepOptions[opt.keepKey]}
                      onCheckedChange={v => setKeepOptions(prev => ({ ...prev, [opt.keepKey]: v }))}
                    />
                    <label htmlFor={opt.keepKey} className="text-sm cursor-pointer">
                      <span className="font-medium">{opt.label}</span> behalten
                      {keepOptions[opt.keepKey]
                        ? <Badge className="ml-2 bg-green-100 text-green-700 border-0">Wird behalten</Badge>
                        : <Badge className="ml-2 bg-red-100 text-red-700 border-0">Wird gelöscht</Badge>}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Confirmation checkboxes */}
            <div className="space-y-3 border rounded-lg p-4 bg-orange-50 border-orange-200">
              <p className="text-sm font-semibold text-orange-900">Pflichtbestätigungen:</p>
              {[
                { key: 'understand', label: 'Ich verstehe, dass operative Datensätze unwiderruflich gelöscht werden.' },
                { key: 'backup', label: 'Ich habe das Backup erstellt oder ausdrücklich bestätigt, dass kein Backup benötigt wird.' },
                { key: 'irreversible', label: 'Ich verstehe, dass dieser Vorgang nicht einfach rückgängig gemacht werden kann.' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-start gap-3">
                  <Checkbox
                    id={key}
                    checked={checks[key]}
                    onCheckedChange={v => setChecks(prev => ({ ...prev, [key]: v }))}
                    className="mt-0.5"
                  />
                  <label htmlFor={key} className="text-sm text-orange-900 cursor-pointer">{label}</label>
                </div>
              ))}
            </div>

            {/* Confirmation text */}
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Zur Bestätigung folgenden Text exakt eingeben:
                <code className="ml-2 px-2 py-0.5 bg-muted rounded font-mono text-xs">{CONFIRMATION_PHRASE}</code>
              </p>
              <Input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder={CONFIRMATION_PHRASE}
                className={`font-mono ${confirmText === CONFIRMATION_PHRASE ? 'border-green-400 bg-green-50' : ''}`}
              />
              {confirmText.length > 0 && confirmText !== CONFIRMATION_PHRASE && (
                <p className="text-xs text-red-500">Text stimmt nicht überein.</p>
              )}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep('backup')}>Zurück</Button>
              <Button
                disabled={!confirmOk}
                onClick={() => setStep('reset')}
                className="gap-2 bg-red-600 hover:bg-red-700"
              >
                <Trash2 className="w-4 h-4" />
                Reset starten
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 3: RESET ── */}
      {step === 'reset' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trash2 className="w-4 h-4 text-red-500" />
              Schritt 3: Operative Daten löschen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!resetLoading && !resetReport && (
              <>
                <Alert className="border-red-200 bg-red-50">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    Dieser Schritt löscht alle ausgewählten operativen Datensätze. Bitte noch einmal bestätigen.
                  </AlertDescription>
                </Alert>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep('confirm')}>Zurück</Button>
                  <Button onClick={runReset} className="gap-2 bg-red-600 hover:bg-red-700">
                    <Trash2 className="w-4 h-4" />
                    Jetzt endgültig zurücksetzen
                  </Button>
                </div>
              </>
            )}
            {resetLoading && (
              <div className="flex flex-col items-center gap-4 py-12">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Datensätze werden gelöscht… bitte warten.</p>
              </div>
            )}
            {resetError && (
              <Alert className="border-red-300 bg-red-50">
                <AlertDescription className="text-red-700">{resetError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── STEP 4: REPORT ── */}
      {step === 'report' && resetReport && (
        <div className="space-y-4">
          <Card className="border-green-300 bg-green-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
                <div>
                  <p className="font-semibold text-green-800 text-lg">Operational Reset abgeschlossen</p>
                  <p className="text-sm text-green-700">Die App ist bereit für den sauberen Neuaufbau der Datenbasis.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Reset Report */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="w-4 h-4 text-primary" />
                Reset Report
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-muted-foreground">Zeitstempel:</div>
                <div className="font-mono text-xs">{new Date(resetReport.timestamp).toLocaleString('de-AT')}</div>
                <div className="text-muted-foreground">Gelöschte Datensätze gesamt:</div>
                <div className="font-semibold text-red-700">{totalDeleted}</div>
                <div className="text-muted-foreground">Backup-Status:</div>
                <div>{resetReport.backupStatus}</div>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Gelöschte Entitäten</p>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(resetReport.entitiesCleared).map(([entity, count]) => (
                    <div key={entity} className="flex justify-between items-center px-3 py-1.5 bg-muted rounded text-sm">
                      <span className="text-muted-foreground">{entity}</span>
                      <Badge variant={typeof count === 'number' ? 'secondary' : 'destructive'}>{count}</Badge>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Behalten</p>
                <div className="flex flex-wrap gap-2">
                  {resetReport.entitiesKept.map(e => (
                    <Badge key={e} className="bg-green-100 text-green-800 border-0">{e}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Next Steps Guide */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nächste Schritte — Sauberer Neuaufbau</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { step: 1, label: 'Auftragsbestätigungen 2025/2026 importieren', desc: 'Auftragsabwicklung → Neue AB hochladen' },
                  { step: 2, label: 'PM Excel-Projektliste hochladen', desc: 'Master-Datenimport → Excel hochladen & mappen' },
                  { step: 3, label: 'Projekt-Cockpits aufbauen', desc: 'Projektzuordnungen prüfen und Billing Blocks anlegen' },
                  { step: 4, label: 'Rechnungen aus sevDesk synchronisieren', desc: 'sevDesk Integration → Rechnungs-Sync starten' },
                  { step: 5, label: 'Rechnungen zu Projekten zuordnen', desc: 'Rechnungszuordnung → Matching Review' },
                  { step: 6, label: 'Monatsplanung starten', desc: 'Nächster Monat → Abrechnungsplanung aufbauen' },
                ].map(({ step, label, desc }) => (
                  <div key={step} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-primary">{step}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}