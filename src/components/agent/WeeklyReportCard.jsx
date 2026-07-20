import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileBarChart, ChevronDown, ChevronUp } from 'lucide-react';

export default function WeeklyReportCard() {
  const [expanded, setExpanded] = useState(false);
  const { data: reports = [] } = useQuery({
    queryKey: ['weekly-intelligence-report'],
    queryFn: () => base44.entities.WeeklyIntelligenceReport.list('-report_date', 1),
  });
  const report = reports[0];
  if (!report || report.status !== 'generated') return null;

  const kpis = (() => { try { return JSON.parse(report.kpi_json || '{}'); } catch { return {}; } })();
  const chips = [
    kpis.quick_win_potenzial_netto > 0 && `⚡ €${kpis.quick_win_potenzial_netto.toLocaleString('de-AT')} Potenzial`,
    kpis.budget_kritisch > 0 && `🔴 ${kpis.budget_kritisch} Budget-kritisch`,
    kpis.ueberfaellig_anzahl > 0 && `💶 ${kpis.ueberfaellig_anzahl} überfällig`,
    kpis.offene_stunden > 0 && `⏱️ ${kpis.offene_stunden}h offen`,
  ].filter(Boolean);

  return (
    <div className="border border-primary/20 bg-primary/5 rounded-xl overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-primary/10 transition-colors">
        <FileBarChart className="w-4 h-4 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{report.title || 'Wochenbericht'}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {chips.map((c, i) => <span key={i} className="text-xs text-muted-foreground">{c}</span>)}
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-primary/10">
          <ReactMarkdown
            className="text-sm prose prose-sm max-w-none mt-3"
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => <div className="overflow-x-auto my-2"><table className="w-full text-xs border-collapse">{children}</table></div>,
              th: ({ children }) => <th className="text-left px-2 py-1 font-semibold border-b">{children}</th>,
              td: ({ children }) => <td className="px-2 py-1 border-b border-border/50">{children}</td>,
            }}
          >
            {report.content_markdown}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}