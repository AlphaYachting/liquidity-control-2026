import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function MappingView({ mapping }) {
  if (!mapping) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Gesprächs-Mapping & Preisvorschlag</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {mapping.mapping_rows?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Aussage → Angebotsposition</p>
            <div className="space-y-1">
              {mapping.mapping_rows.map((r, i) => (
                <div key={i} className="flex gap-2 text-xs border-b last:border-0 py-1.5">
                  <span className="flex-1 italic text-muted-foreground">„{r.statement}"</span>
                  <span className="flex-1 font-medium">→ {r.position}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {mapping.excluded_rows?.length > 0 && (
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs font-medium mb-1">Gegencheck — NICHT im Angebot</p>
            {mapping.excluded_rows.map((r, i) => (
              <p key={i} className="text-xs text-muted-foreground">• <strong>{r.point}</strong> — {r.reason}</p>
            ))}
          </div>
        )}

        {mapping.positions?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Positionen</p>
            {mapping.positions.map((p, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="flex justify-between gap-2">
                  <p className="font-semibold text-xs">{p.title}{p.optional ? ' (optional)' : ''}</p>
                  <p className="text-xs font-bold text-emerald-600 whitespace-nowrap">{p.price}{p.price_suffix ? ` ${p.price_suffix}` : ''}</p>
                </div>
                {p.goal && <p className="text-[11px] text-muted-foreground mt-1">Ziel — {p.goal}</p>}
                {p.items?.length > 0 && (
                  <ul className="list-disc list-inside text-[11px] mt-1 space-y-0.5">
                    {p.items.map((it, j) => <li key={j}>{it}</li>)}
                  </ul>
                )}
                {p.result && <p className="text-[11px] mt-1"><span className="text-muted-foreground">Ergebnis —</span> {p.result}</p>}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs">
          <span>Netto: <strong className="text-emerald-700">{mapping.total_net}</strong></span>
          <span>Brutto: <strong className="text-emerald-700">{mapping.total_gross}</strong></span>
        </div>

        {mapping.notes && <p className="text-[11px] text-muted-foreground">{mapping.notes}</p>}
      </CardContent>
    </Card>
  );
}