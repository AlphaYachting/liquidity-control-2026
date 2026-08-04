import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';

const Stat = ({ label, value }) => (
  <div className="border rounded-lg p-3">
    <p className="text-[11px] text-muted-foreground">{label}</p>
    <p className="text-lg font-semibold">{value ?? 0}</p>
  </div>
);

// Sichtbarkeit des Posteingangs-Laufs: letzter Lauf, Kennzahlen, Fehler, manueller Start.
export default function InboxScanSettings() {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['inbox-scan-runs'],
    queryFn: () => base44.entities.InboxScanRun.list('-run_at', 5),
  });
  const last = runs[0];

  const runNow = async () => {
    setRunning(true); setError(null);
    try {
      await base44.functions.invoke('analyseEingang', {});
      queryClient.invalidateQueries({ queryKey: ['inbox-scan-runs'] });
      queryClient.invalidateQueries({ queryKey: ['crm-inbox'] });
      queryClient.invalidateQueries({ queryKey: ['crm-inbox-badge'] });
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Der Lauf ist fehlgeschlagen.');
    }
    setRunning(false);
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Posteingangs-Prüfung</CardTitle>
        <Button size="sm" onClick={runNow} disabled={running} className="gap-2">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {running ? 'Prüft…' : 'Jetzt prüfen'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Prüft neue E-Mail-Threads der letzten 14 Tage auf Geschäftsanfragen. Ein Lead entsteht automatisch
          nur aus einer Website-Formular-Anfrage — alles andere landet im CRM-Posteingang.
        </p>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Lädt…</p>
        ) : !last ? (
          <p className="text-xs text-muted-foreground">Noch kein Lauf protokolliert.</p>
        ) : (
          <>
            <p className="text-xs">
              Letzter Lauf: <span className="font-medium">{new Date(last.run_at).toLocaleString('de-AT')}</span>
              {last.triggered_by ? ` · ${last.triggered_by}` : ''}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              <Stat label="Geprüfte Threads" value={last.checked} />
              <Stat label="Lead-Verdacht" value={last.lead_verdacht} />
              <Stat label="Formular-Leads" value={last.form_leads} />
              <Stat label="KI-Aufrufe" value={last.llm_calls} />
              <Stat label="Offen für nächsten Lauf" value={last.skipped_limit} />
            </div>
            {(last.errors || []).length > 0 && (
              <div className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Fehler im letzten Lauf
                </p>
                <ul className="text-[11px] text-amber-800 space-y-0.5 list-disc pl-4">
                  {last.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}