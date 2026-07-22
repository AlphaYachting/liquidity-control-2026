import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, XCircle, Package, Map } from 'lucide-react';

export default function MappingView({ mapping }) {
  if (!mapping) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Map className="w-4 h-4 text-primary" /> Gesprächs-Mapping & Preisvorschlag
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {/* Aussage → Position */}
        {mapping.mapping_rows?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Aussage → Angebotsposition</p>
            {mapping.mapping_rows.map((r, i) => (
              <div key={i} className="rounded-lg bg-muted/40 p-3 space-y-1.5">
                <p className="text-xs italic text-muted-foreground leading-relaxed">„{r.statement}"</p>
                <p className="text-xs font-semibold flex items-start gap-1.5">
                  <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" /> {r.position}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Gegencheck — jeder Punkt eigene Karte */}
        {mapping.excluded_rows?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5" /> Gegencheck — bewusst NICHT im Angebot
            </p>
            {mapping.excluded_rows.map((r, i) => (
              <div key={i} className="rounded-lg border border-dashed p-3">
                <p className="text-xs font-semibold mb-1">{r.point}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{r.reason}</p>
              </div>
            ))}
          </div>
        )}

        {/* Pakete / Positionen — klar gegliedert */}
        {mapping.positions?.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" /> Positionen & Pakete
            </p>
            {mapping.positions.map((p, i) => (
              <div key={i} className="rounded-xl border overflow-hidden">
                <div className="flex items-center justify-between gap-3 bg-muted/50 px-4 py-2.5 border-b">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                    <p className="font-semibold text-sm truncate">{p.title}</p>
                    {p.optional && <Badge variant="outline" className="text-[10px] shrink-0">Optional</Badge>}
                  </div>
                  <p className="text-sm font-bold text-emerald-600 whitespace-nowrap">{p.price}{p.price_suffix ? ` ${p.price_suffix}` : ''}</p>
                </div>
                <div className="px-4 py-3 space-y-2.5">
                  {p.goal && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-0.5">Ziel</p>
                      <p className="text-xs leading-relaxed">{p.goal}</p>
                    </div>
                  )}
                  {p.items?.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Leistungen</p>
                      <ul className="space-y-1">
                        {p.items.map((it, j) => (
                          <li key={j} className="text-xs leading-relaxed flex gap-2">
                            <span className="text-primary shrink-0">•</span>
                            <span>{it}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {p.result && (
                    <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold mb-0.5">Ergebnis</p>
                      <p className="text-xs text-emerald-900 leading-relaxed">{p.result}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summen */}
        <div className="flex justify-end gap-6 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold">Netto</p>
            <p className="text-sm font-bold text-emerald-700">{mapping.total_net}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold">Brutto (20% USt.)</p>
            <p className="text-sm font-bold text-emerald-700">{mapping.total_gross}</p>
          </div>
        </div>

        {mapping.notes && <p className="text-xs text-muted-foreground leading-relaxed">{mapping.notes}</p>}
      </CardContent>
    </Card>
  );
}