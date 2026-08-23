import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

// Zuletzt erzeugter Wochenbericht — mit Neuberechnung und Veraltet-Kennzeichnung.
export default function WochenberichtKarte({ report, onRefreshed }) {
  const [laeuft, setLaeuft] = useState(false);

  const alter = report?.report_date
    ? Math.floor((Date.now() - new Date(report.report_date).getTime()) / 86400000)
    : null;
  const veraltet = alter === null || alter > 8;

  const neuBerechnen = async () => {
    setLaeuft(true);
    const res = await base44.functions.invoke('generateWeeklyIntelligenceReport', {});
    setLaeuft(false);
    if (res?.data?.error) { toast.error('Bericht konnte nicht erzeugt werden.'); return; }
    toast.success('Bericht neu berechnet.');
    onRefreshed?.();
  };

  return (
    <section className="rounded-xl border bg-card">
      <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold truncate">{report?.title || 'Wochenbericht'}</h2>
          <p className="text-xs text-muted-foreground">
            {report ? `Erstellt am ${new Date(report.report_date).toLocaleDateString('de-AT')}` : 'Noch kein Bericht erzeugt'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {veraltet && (
            <span className="inline-flex items-center gap-1 text-xs font-medium rounded-md px-2 py-1 bg-status-critical-surface text-status-critical">
              <AlertTriangle className="w-3.5 h-3.5" /> veraltet
            </span>
          )}
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={neuBerechnen} disabled={laeuft}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${laeuft ? 'animate-spin' : ''}`} />
            Bericht jetzt neu berechnen
          </Button>
        </div>
      </div>
      {report?.content_markdown && (
        <div className="px-4 py-3 max-h-72 overflow-y-auto prose prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.content_markdown}</ReactMarkdown>
        </div>
      )}
    </section>
  );
}