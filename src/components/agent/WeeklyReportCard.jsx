import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileBarChart, ChevronDown, ChevronUp, TrendingUp, Receipt, AlertTriangle, Clock } from 'lucide-react';

const KpiChip = ({ icon: Icon, label, value, tone }) => {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${tones[tone]}`}>
      <Icon className="w-3 h-3 shrink-0" />
      <span className="opacity-70">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
};

const eur = (n) => `€${Math.round(n || 0).toLocaleString('de-AT')}`;

export default function WeeklyReportCard() {
  const [expanded, setExpanded] = useState(false);
  const { data: reports = [] } = useQuery({
    queryKey: ['weekly-intelligence-report'],
    queryFn: () => base44.entities.WeeklyIntelligenceReport.list('-created_date', 1),
  });
  const report = reports[0];
  if (!report || report.status !== 'generated') return null;

  const kpis = (() => { try { return JSON.parse(report.kpi_json || '{}'); } catch { return {}; } })();

  return (
    <div className="border border-primary/20 bg-card rounded-xl overflow-hidden shadow-sm">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full text-left hover:bg-muted/40 transition-colors">
        <div className="flex items-center gap-3 px-4 pt-3">
          <div className="p-1.5 rounded-lg bg-primary/10 shrink-0">
            <FileBarChart className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{report.title || 'Wochenvorschau'}</p>
            <p className="text-[11px] text-muted-foreground">
              Erstellt am {new Date(report.report_date).toLocaleDateString('de-AT')} · proaktiver Plan für die kommende Woche
            </p>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
        </div>
        <div className="flex flex-wrap gap-1.5 px-4 py-3">
          {kpis.zahlungseingaenge_naechste_woche > 0 && (
            <KpiChip icon={TrendingUp} tone="emerald" label="Eingänge nä. Woche" value={eur(kpis.zahlungseingaenge_naechste_woche)} />
          )}
          {(kpis.geplante_abrechnungen_netto > 0 || kpis.quick_win_potenzial_netto > 0) && (
            <KpiChip icon={Receipt} tone="blue" label="Abrechnen"
              value={eur((kpis.geplante_abrechnungen_netto || 0) + (kpis.quick_win_potenzial_netto || 0))} />
          )}
          {kpis.ueberfaellig_summe > 0 && (
            <KpiChip icon={AlertTriangle} tone="red" label={`${kpis.ueberfaellig_anzahl} überfällig`} value={eur(kpis.ueberfaellig_summe)} />
          )}
          {kpis.offene_stunden > 0 && (
            <KpiChip icon={Clock} tone="amber" label={`${kpis.offene_stunden}h offen`} value={eur(kpis.offene_stunden_wert_netto)} />
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t">
          <ReactMarkdown
            className="text-sm max-w-none mt-3"
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => <h1 className="text-base font-bold mt-4 mb-2">{children}</h1>,
              h2: ({ children }) => <h2 className="text-sm font-bold mt-5 mb-2 pb-1.5 border-b border-border flex items-center gap-1.5">{children}</h2>,
              h3: ({ children }) => <h3 className="text-sm font-semibold mt-3 mb-1.5">{children}</h3>,
              p: ({ children }) => <p className="my-1.5 leading-relaxed text-muted-foreground">{children}</p>,
              ul: ({ children }) => <ul className="my-1.5 ml-4 list-disc space-y-0.5">{children}</ul>,
              ol: ({ children }) => <ol className="my-2 ml-4 list-decimal space-y-1.5">{children}</ol>,
              li: ({ children }) => <li className="leading-relaxed">{children}</li>,
              strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
              table: ({ children }) => (
                <div className="overflow-x-auto my-2 rounded-lg border">
                  <table className="w-full text-xs border-collapse">{children}</table>
                </div>
              ),
              thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
              tr: ({ children }) => <tr className="border-b border-border/60 last:border-0 even:bg-muted/30">{children}</tr>,
              th: ({ children }) => <th className="text-left px-2.5 py-1.5 font-semibold whitespace-nowrap">{children}</th>,
              td: ({ children }) => <td className="px-2.5 py-1.5 text-muted-foreground">{children}</td>,
            }}
          >
            {report.content_markdown}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}