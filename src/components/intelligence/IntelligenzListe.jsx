import React from 'react';
import { BrainCircuit } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Eine der stehenden Listen der Projekt-Intelligence — Kopf mit Zähler, Tabelle, Knopf je Zeile.
export default function IntelligenzListe({ title, hint, columns, rows, onOpen, compact }) {
  return (
    <section className="rounded-xl border bg-card">
      <div className="px-4 py-3 border-b flex items-baseline gap-2">
        <h2 className={`font-semibold uppercase tracking-wide ${compact ? 'text-xs' : 'text-sm'}`}>{title}</h2>
        <span className="text-xs text-muted-foreground">({rows.length})</span>
        {hint && <span className="text-xs text-muted-foreground ml-2">{hint}</span>}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">Keine Einträge.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                {columns.map(c => (
                  <th key={c.label} className={`px-4 py-2 font-medium ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                    {c.label}
                  </th>
                ))}
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.project_id} className="border-b last:border-0 hover:bg-muted/50">
                  {columns.map(c => (
                    <td key={c.label} className={`px-4 py-2 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                      {c.get(r)}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onOpen(r)}>
                      <BrainCircuit className="w-3.5 h-3.5 mr-1" /> Intelligenz
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}