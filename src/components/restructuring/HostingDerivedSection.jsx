import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { ExternalLink, AlertTriangle } from 'lucide-react';
import { fmtEUR, OUTFLOW_INTERVAL_LABELS } from '@/lib/restructuring/restructuringFormat';
import { monthlyEquivalent } from '@/lib/restructuring/toolCostOutflows';

/**
 * Hosting & SaaS wird nicht mehr manuell erfasst, sondern aus der Tool-Verwaltung
 * abgeleitet. Diese Karte zeigt die abgeleitete Monatssumme statt eines Eingabefelds.
 */
export default function HostingDerivedSection({ derived = [], manualDuplicates = [] }) {
  const monthly = monthlyEquivalent(derived);
  const ending = derived.filter((d) => d.end_month);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-bold">Hosting & Software (abgeleitet)</h2>
        <span className="text-xs text-muted-foreground">
          Monatsäquivalent: <b className="text-foreground">{fmtEUR(monthly)}</b>
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Diese Auszahlungen werden aus der Tool-Verwaltung abgeleitet — {derived.length} laufende Dienste mit ihrem
        jeweiligen Zahlungsintervall und Fälligkeitsdatum. Eine manuelle Erfassung ist hier nicht mehr vorgesehen.
      </p>
      <Link to="/tools" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-1">
        Tool-Verwaltung öffnen <ExternalLink className="w-3 h-3" />
      </Link>

      {ending.length > 0 && (
        <p className="text-[11px] text-emerald-700 mt-2">
          {ending.length} Dienste sind zur Kündigung vorgesehen und entfallen ab dem hinterlegten Termin —
          der Kostenabsprung ist damit in der Liquiditätsplanung abgebildet.
        </p>
      )}

      {derived.length > 0 && (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 px-2">Dienst</th>
                <th className="text-right py-2 px-2">Betrag je Fälligkeit</th>
                <th className="text-left py-2 px-2">Rhythmus</th>
                <th className="text-right py-2 px-2">Fällig am</th>
                <th className="text-left py-2 px-2">Entfällt ab</th>
              </tr>
            </thead>
            <tbody>
              {derived.map((d) => (
                <tr key={d.id} className="border-b border-border/50">
                  <td className="py-1.5 px-2">{d.label}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{fmtEUR(d.amount)}</td>
                  <td className="py-1.5 px-2">{OUTFLOW_INTERVAL_LABELS[d.interval] || 'monatlich'}</td>
                  <td className="py-1.5 px-2 text-right">{d.due_day_of_month}.</td>
                  <td className="py-1.5 px-2">{d.cancellation_effective_date || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {manualDuplicates.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-[11px] font-semibold text-amber-800 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Mögliche Doppelerfassung
          </p>
          <p className="text-[11px] text-amber-800 mt-1">
            {manualDuplicates.length} manuell erfasste Auszahlungen der Kategorie Hosting & Software sind weiterhin
            aktiv und fließen zusätzlich in den Plan. Bitte prüfen und bei Bedarf in der Liste oben löschen — es wird
            nichts automatisch entfernt.
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {manualDuplicates.map((m) => (
              <li key={m.id} className="text-[11px] text-amber-900 tabular-nums">
                {m.label} — {fmtEUR(m.amount)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}