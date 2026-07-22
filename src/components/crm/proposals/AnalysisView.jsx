import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageCircleQuestion, FileText, Target } from 'lucide-react';

export default function AnalysisView({ analysis }) {
  if (!analysis) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" /> Strategische Analyse & Gap-Analyse
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {/* Einordnung — untereinander für bessere Lesbarkeit */}
        <div className="space-y-2">
          {[
            ['Projekttyp', analysis.project_type],
            ['Zielhierarchie', analysis.goal_hierarchy],
            ['Komplexität', analysis.complexity],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-muted/50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">{label}</p>
              <p className="font-medium leading-relaxed">{value || '—'}</p>
            </div>
          ))}
        </div>

        {/* Gap-Analyse als gestapelte Karten statt Tabelle */}
        {analysis.gap_rows?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gap-Analyse</p>
            {analysis.gap_rows.map((r, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-2">
                <p className="font-semibold text-sm">{r.topic}</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex gap-2">
                    <span className="shrink-0 w-24 text-muted-foreground font-medium">Im Gespräch</span>
                    <span className="leading-relaxed">{r.in_conversation || '—'}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="shrink-0 w-24 text-muted-foreground font-medium">Im Angebot</span>
                    <span className="leading-relaxed">{r.in_proposal || '—'}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="shrink-0 w-24 text-muted-foreground font-medium">Handlung</span>
                    <span className="leading-relaxed font-medium text-foreground">{r.action || '—'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empfohlenes Format — klarer strukturiert */}
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Empfohlenes Angebotsformat
          </p>
          <Badge className="text-sm px-3 py-1">{analysis.recommended_format}</Badge>
          <p className="text-sm leading-relaxed text-foreground/80">{analysis.format_reasoning}</p>
        </div>

        {/* Offene Fragen — nummeriert, einzeln beantwortbar */}
        {analysis.open_questions?.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 space-y-3">
            <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
              <MessageCircleQuestion className="w-3.5 h-3.5" /> Offene Fragen — bitte unten beantworten (Text oder Spracheingabe)
            </p>
            <ol className="space-y-2">
              {analysis.open_questions.map((q, i) => (
                <li key={i} className="flex gap-2.5 items-start">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-amber-200 text-amber-900 text-[11px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                  <span className="text-sm text-amber-950 leading-relaxed">{q}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}