import React, { useState } from 'react';
import { fmtStd, fmtQuote } from '@/lib/arbeitszeit/auswertung';

// Waagrechte Balken: Länge = Anteil an der Summe, der dunkle Teil = verrechenbar (falls bekannt)
function Liste({ titel, untertitel, zeilen, mitVerr }) {
  const summe = zeilen.reduce((s, z) => s + Math.max(0, z.minuten), 0);
  return (
    <div className="bg-white rounded border border-border p-4 space-y-3">
      <div>
        <h2 className="text-section font-bold uppercase tracking-tight">{titel}</h2>
        {untertitel && <p className="text-meta text-muted-foreground">{untertitel}</p>}
      </div>
      {!zeilen.length ? <p className="text-meta text-muted-foreground">Keine Buchungen.</p> : (
        <ul className="space-y-2">
          {zeilen.map((z) => (
            <li key={z.key} className="space-y-1">
              <div className="flex justify-between gap-3 text-meta">
                <span className="truncate">{z.label}</span>
                <span className="tabular-nums whitespace-nowrap">
                  {fmtStd(z.minuten)} h · {fmtQuote(summe ? z.minuten / summe : null)}
                  {mitVerr && <span className="text-muted-foreground"> · {fmtQuote(z.minuten ? z.verrMin / z.minuten : null)} verr.</span>}
                </span>
              </div>
              <div className="h-2 rounded bg-muted overflow-hidden">
                <div className="h-full rounded relative" style={{ width: `${summe ? Math.max(0, z.minuten / summe) * 100 : 0}%`, background: z.farbe ? `color-mix(in srgb, ${z.farbe} 40%, white)` : 'hsl(var(--muted-foreground) / 0.35)' }}>
                  {mitVerr && <div className="absolute inset-y-0 left-0" style={{ width: `${z.minuten ? Math.max(0, z.verrMin / z.minuten) * 100 : 0}%`, background: z.farbe || 'hsl(var(--foreground))' }} />}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AzVerteilung({ ergebnis }) {
  const { arten, taetigkeit, nvGruende, quellen } = ergebnis;
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Liste titel="Nach Arbeitsart" untertitel="Kräftiger Teil = verrechenbar" zeilen={arten} mitVerr />
      <Liste titel="Nach Tätigkeit" zeilen={taetigkeit} />
      <Liste titel="Nicht verrechenbar nach Grund"
        untertitel={`Nur Firmenebene, nie je Person${quellen.awork ? ' · nur App-Daten (aWork kennt keinen Grund)' : ''}`}
        zeilen={nvGruende} />
    </div>
  );
}

export function AzProjekte({ projekte }) {
  const [alle, setAlle] = useState(false);
  const liste = alle ? projekte : projekte.slice(0, 12);
  if (!projekte.length) return null;
  return (
    <div className="bg-white rounded border border-border overflow-x-auto">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-2">
        <h2 className="text-section font-bold uppercase tracking-tight">Wohin die Zeit geht</h2>
        <span className="text-meta text-muted-foreground">{projekte.length} Projekte mit Buchungen</span>
      </div>
      <table className="w-full text-body">
        <thead>
          <tr className="border-b border-border">
            {['Projekt', 'Erfasst h', 'Verrechenbar h', 'Anteil verr.', 'Personen'].map((s, i) => (
              <th key={s} className={`text-label uppercase text-muted-foreground font-medium px-3 py-2 ${i ? 'text-right' : 'text-left'}`}>{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {liste.map((p) => (
            <tr key={p.key} className="border-b border-border last:border-0">
              <td className="px-3 py-2">{p.label}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtStd(p.minuten)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtStd(p.verrMin)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtQuote(p.minuten ? p.verrMin / p.minuten : null)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{p.personen}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {projekte.length > 12 && (
        <button type="button" className="text-meta text-muted-foreground hover:underline px-4 py-3" onClick={() => setAlle(!alle)}>
          {alle ? 'Nur die größten zwölf zeigen' : `Alle ${projekte.length} Projekte zeigen`}
        </button>
      )}
    </div>
  );
}
