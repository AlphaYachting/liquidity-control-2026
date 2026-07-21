import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function AnalysisView({ analysis }) {
  if (!analysis) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Strategische Analyse & Gap-Analyse</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-[11px] text-muted-foreground font-medium">Projekttyp</p>
            <p className="font-semibold">{analysis.project_type}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-[11px] text-muted-foreground font-medium">Zielhierarchie</p>
            <p className="font-semibold">{analysis.goal_hierarchy}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-[11px] text-muted-foreground font-medium">Komplexität</p>
            <p className="font-semibold">{analysis.complexity}</p>
          </div>
        </div>

        {analysis.gap_rows?.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Strategisches Thema</th>
                  <th className="py-2 pr-3 font-medium">Im Gespräch?</th>
                  <th className="py-2 pr-3 font-medium">Im Angebot?</th>
                  <th className="py-2 font-medium">Handlung</th>
                </tr>
              </thead>
              <tbody>
                {analysis.gap_rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{r.topic}</td>
                    <td className="py-2 pr-3">{r.in_conversation}</td>
                    <td className="py-2 pr-3">{r.in_proposal}</td>
                    <td className="py-2">{r.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="rounded-lg border p-3">
          <p className="text-[11px] text-muted-foreground font-medium mb-1">Empfohlenes Angebotsformat</p>
          <Badge variant="secondary" className="mb-2">{analysis.recommended_format}</Badge>
          <p className="text-xs text-muted-foreground">{analysis.format_reasoning}</p>
        </div>

        {analysis.open_questions?.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
            <p className="text-[11px] font-medium text-amber-800 mb-1">Offene Fragen</p>
            <ul className="list-disc list-inside text-xs text-amber-900 space-y-0.5">
              {analysis.open_questions.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}