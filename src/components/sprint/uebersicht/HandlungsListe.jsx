import React from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Ampelpunkt from '@/components/sprint/Ampelpunkt';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';

const SHAPE = { kritisch: 'critical', warnung: 'attention', hinweis: 'plan' };
const RANK = { kritisch: 0, warnung: 1, hinweis: 2 };

// X4 Block 2 — höchstens fünf Empfehlungen, zuerst steht, was in Ordnung ist.
export default function HandlungsListe({ signals, projectsById, imPlan, brauchenAufmerksamkeit, onResolve }) {
  const top = [...signals]
    .sort((a, b) => (RANK[a.severity] ?? 3) - (RANK[b.severity] ?? 3))
    .slice(0, 5);

  return (
    <div className="bg-white rounded-lg border border-border">
      <div className="px-4 py-3 border-b" style={{ borderColor: RITTLER.line }}>
        <p className="text-[11px] font-bold uppercase tracking-[2px]" style={{ color: RITTLER.pink700 }}>
          Was braucht eine Entscheidung
        </p>
        <p className="text-sm mt-0.5" style={{ color: RITTLER.textSecondary }}>
          {imPlan} {imPlan === 1 ? 'Projekt läuft' : 'Projekte laufen'} im Plan
          {brauchenAufmerksamkeit > 0 ? ` · ${brauchenAufmerksamkeit} brauchen Aufmerksamkeit` : ''}
        </p>
      </div>

      {top.length === 0 ? (
        <p className="px-4 py-5 flex items-center gap-2 text-sm font-semibold" style={{ color: RITTLER.black }}>
          <Check className="w-4 h-4" strokeWidth={3} /> Alles im Plan
        </p>
      ) : (
        top.map((s) => (
          <div key={s.id} className="flex items-start gap-3 px-4 py-3 border-b border-[#eeeeee] last:border-0">
            <Ampelpunkt status={SHAPE[s.severity] || 'attention'} className="mt-1.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold" style={{ color: RITTLER.black }}>
                {projectsById[s.project_id]?.title || 'Projekt'}
              </p>
              <p className="text-sm" style={{ color: s.severity === 'kritisch' ? STATUS_COLORS.critical : RITTLER.textSecondary }}>
                → {s.recommendation}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" className="rounded border-[1.5px] border-foreground text-foreground" onClick={() => onResolve(s)}>
                Erledigt
              </Button>
              {s.sprint_id && (
                <Button size="sm" className="bg-primary hover:bg-primary/90 text-white font-bold uppercase rounded" asChild>
                  <Link to={`/sprint/sprints/${s.sprint_id}`}>Öffnen</Link>
                </Button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}