import React, { useState } from 'react';
import { ChevronRight, RefreshCw, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

export default function StepInvoiceSync({ onConfirm }) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [error, setError] = useState(null);
  const [skip, setSkip] = useState(false);

  async function runSync() {
    setSyncing(true);
    setError(null);
    try {
      const resp = await base44.functions.invoke('syncSevdeskInvoices', { batch_size: 100 });
      setSyncResult(resp.data);
    } catch (e) {
      setError(e.message || 'Sync-Fehler');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Schritt 5: Rechnungen aus sevDesk synchronisieren</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Rechnungen werden aus sevDesk (Verrechnungsprogramm) als Wahrheitsquelle synchronisiert.
          Bestehende InvoiceRecords werden nicht gelöscht, nur ergänzt/aktualisiert.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">Verrechnungssystem = Wahrheit für Rechnungsstatus</p>
        <p>Nach dem Sync zeigen InvoiceRecord-Einträge den tatsächlichen Ist-Stand aus sevDesk (Betrag, Zahlungsstatus, Zahlungsdatum).</p>
      </div>

      {!syncResult && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={runSync} disabled={syncing} className="gap-2">
            {syncing ? <><Loader2 className="w-4 h-4 animate-spin" /> Synchronisiert…</> : <><RefreshCw className="w-4 h-4" /> Rechnungen aus sevDesk synchronisieren</>}
          </Button>
          <Button variant="outline" onClick={() => { setSkip(true); onConfirm({ skipped: true }); }} className="text-muted-foreground">
            Überspringen (Rechnungen bereits aktuell)
          </Button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {syncResult && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-semibold">Sync abgeschlossen</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            {[
              { label: 'Verarbeitet', value: syncResult.processed ?? '—' },
              { label: 'Erstellt', value: syncResult.created ?? '—' },
              { label: 'Aktualisiert', value: syncResult.updated ?? '—' },
              { label: 'Fehler', value: syncResult.errors ?? 0 },
            ].map(k => (
              <div key={k.label} className="border rounded-xl p-3">
                <p className="text-xl font-bold">{k.value}</p>
                <p className="text-xs text-muted-foreground">{k.label}</p>
              </div>
            ))}
          </div>
          {syncResult.error_details && (
            <p className="text-xs text-red-600">{syncResult.error_details}</p>
          )}
          <Button onClick={() => onConfirm(syncResult)} className="gap-2">
            Weiter zum Abgleich
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}