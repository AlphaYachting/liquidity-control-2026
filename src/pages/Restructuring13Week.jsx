import React, { useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { useRestructuringData } from '@/lib/restructuring/useRestructuringData';
import { build13Week } from '@/lib/restructuring/restructuringEngine';
import { fmtEUR, fmtDate, OUTFLOW_CATEGORY_LABELS, OUTFLOW_INTERVAL_LABELS } from '@/lib/restructuring/restructuringFormat';
import { exportPDF, exportExcel } from '@/lib/restructuring/restructuringExport';
import ReportCard from '@/components/restructuring/ReportCard';
import ReportTable from '@/components/restructuring/ReportTable';

const SOURCE = 'Bankbestand + fällige Debitoren + Retainer/Hosting + Auftragsbestand − erfasste Auszahlungen';

export default function Restructuring13Week() {
  const { data, isLoading } = useRestructuringData();
  const result = useMemo(() => (data ? build13Week(data) : null), [data]);
  const [expandedWeeks, setExpandedWeeks] = useState(() => new Set());

  const toggleWeek = (idx) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  if (isLoading || !result) {
    return <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-96" /></div>;
  }

  const fmtShort = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
  };
  const weekRange = (r) => `${fmtShort(r.week_start)}–${fmtShort(r.week_end)}`;

  const columns = [
    { key: 'week', label: 'Woche', render: (r) => (
      <div>
        <span className={r.is_hearing_week ? 'font-bold text-purple-800' : ''}>W{r.index + 1}</span>
        {r.is_hearing_week && (
          <p className="text-[10px] font-semibold text-purple-700 whitespace-nowrap">
            Berichtstagsatzung — auf diese Zeile kommt es an
          </p>
        )}
      </div>
    ) },
    { key: 'range', label: 'Zeitraum', render: weekRange },
    { key: 'opening', label: 'Anfangsbestand', align: 'right', render: (r) => fmtEUR(r.opening) },
    { key: 'receivables_in', label: 'Debitoren', align: 'right', render: (r) => fmtEUR(r.receivables_in) },
    { key: 'recurring_in', label: 'Retainer/Hosting', align: 'right', render: (r) => fmtEUR(r.recurring_in) },
    { key: 'backlog_in', label: 'Auftragsbestand', align: 'right', render: (r) => fmtEUR(r.backlog_in) },
    { key: 'inflow', label: 'Einzahlungen', align: 'right', render: (r) => fmtEUR(r.inflow), className: 'font-semibold' },
    { key: 'outflow', label: 'Auszahlungen', align: 'right', render: (r) => (
      (r.outflow_by_category?.length || 0) > 0 ? (
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:underline"
          onClick={() => toggleWeek(r.index)}
          title="Auszahlungen je Kategorie anzeigen"
        >
          {expandedWeeks.has(r.index)
            ? <ChevronDown className="w-3 h-3" />
            : <ChevronRight className="w-3 h-3" />}
          {fmtEUR(r.outflow)}
        </button>
      ) : fmtEUR(r.outflow)
    ) },
    { key: 'closing', label: 'Endbestand', align: 'right', render: (r) => fmtEUR(r.closing), className: 'font-bold' },
  ];

  const exportRows = result.rows.map((r) => [
    `W${r.index + 1}`, weekRange(r), r.opening.toFixed(2), r.receivables_in.toFixed(2), r.recurring_in.toFixed(2), r.backlog_in.toFixed(2), r.inflow.toFixed(2), r.outflow.toFixed(2), r.closing.toFixed(2),
  ]);
  const exportCols = columns.map((c) => c.label);

  const hasNegative = result.rows.some((r) => r.negative);
  const lowest = Math.min(...result.rows.map((r) => r.closing));

  const hearingIdx = result.plan?.hearingWeekIndex ?? -1;

  return (
    <div className="space-y-4">
      {result.plan?.planStartMissing && (
        <div className="flex items-start gap-2 text-xs text-red-800 rounded-lg border border-red-300 bg-red-50 p-3">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            <b>Planbeginn nicht gepflegt</b> — die Vorschau startet vorläufig mit dem Montag der aktuellen Woche und
            verschiebt sich damit rollierend. Bitte unter „Eingaben &amp; Annahmen" den fixen Planbeginn (Woche 1) erfassen,
            sonst ist kein Plan-Ist-Vergleich möglich.
          </span>
        </div>
      )}
      {!result.openingSnap && (
        <div className="flex items-start gap-2 text-xs text-amber-800 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>Kein Bankanfangsbestand erfasst — Vorschau startet bei 0. Bitte unter „Eingaben & Annahmen" pflegen.</span>
        </div>
      )}
      {hasNegative && (
        <div className="flex items-start gap-2 text-xs text-red-800 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>Liquiditätsunterschreitung erkannt — tiefster Endbestand {fmtEUR(lowest)}. Rot markierte Wochen weisen einen negativen Endbestand aus.</span>
        </div>
      )}

      {result.projection && (
        <div className="text-[11px] text-muted-foreground rounded-lg border border-border bg-muted/30 p-3 space-y-1">
          <p className="font-semibold text-foreground">Hochrechnungs-Basis der Einzahlungen</p>
          <p>• <b>Debitoren:</b> offene Forderungen nach Fälligkeitsdatum (überfällige in KW 1).</p>
          <p>• <b>Retainer/Hosting:</b> {fmtEUR(result.projection.recurringMonthly)} / Monat aus aktiven Verträgen, jeweils zum Monatsersten.</p>
          <p>
            • <b>Auftragsbestand:</b> {fmtEUR(result.projection.backlogTotal)} offener Leistungswert,
            davon {fmtEUR(result.projection.backlogUndated)} ohne Termin gleichmäßig über {result.plan?.weeks || 13} Wochen
            ({fmtEUR(result.projection.undatedPerWeek)} / Woche), {fmtEUR(result.projection.backlogDated)} zum jeweiligen Erwartungsmonat.
          </p>
        </div>
      )}

      <ReportCard
        title={`${result.plan?.weeks || 13}-Wochen-Liquiditätsplan${result.plan?.planStartMissing ? '' : ` (fixer Planbeginn ${fmtDate(result.plan.startDate)})`}`}
        sourceNote={SOURCE}
        onExportPDF={() => exportPDF('13-Wochen-Vorschau', exportCols, exportRows, {
          sourceNote: SOURCE, numericCols: [2, 3, 4, 5, 6, 7, 8],
          summaryLines: [`Anfangsbestand: ${fmtEUR(result.openingBalance)}`, `Tiefster Endbestand: ${fmtEUR(lowest)}`],
        })}
        onExportExcel={() => exportExcel('13-Wochen-Vorschau', exportCols, exportRows, SOURCE)}
      >
        <p className="text-[11px] text-muted-foreground mb-3">
          Anfangsbestand {fmtEUR(result.openingBalance)}
          {result.openingSnap && <span> (Stand {fmtDate(result.openingSnap.balance_date)})</span>}
          {result.plan?.hearingDate && <span> · Berichtstagsatzung: {fmtDate(result.plan.hearingDate)} (violett markiert, Wochen davor = Nachweiszeitraum)</span>}
        </p>
        <ReportTable
          columns={columns}
          rows={result.rows}
          rowClassName={(r) => {
            if (r.negative) return 'bg-red-50 text-red-700';
            if (r.is_hearing_week) return 'bg-purple-100/80';
            if (hearingIdx >= 0 && r.index < hearingIdx) return 'bg-purple-50/40';
            return '';
          }}
          renderDetail={(r) =>
            expandedWeeks.has(r.index) && (r.outflow_by_category?.length || 0) > 0 ? (
              <div className="pl-6 py-1 space-y-1.5 text-[11px]">
                {r.outflow_by_category.map((g) => (
                  <div key={g.category}>
                    <p className="font-semibold">
                      {OUTFLOW_CATEGORY_LABELS[g.category] || g.category} — {fmtEUR(g.total)}
                    </p>
                    {g.items.map((it, k) => (
                      <p key={`${it.id}-${k}`} className="text-muted-foreground pl-3">
                        {it.label} · fällig {fmtDate(it.due_date)} · {fmtEUR(it.amount)}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            ) : null
          }
        />
      </ReportCard>

      {(result.scenarioItems?.length || 0) > 0 && (
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-xs font-bold mb-2">Szenarioposten — nicht im Basisplan</p>
          <p className="text-[11px] text-muted-foreground mb-2">
            Auszahlungen, deren Höhe nicht vom Unternehmen bestimmt wird (Verwalterentlohnung, Verfahrenskosten, GF-Bezug).
            Sie werden nur in Szenarien angesetzt.
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-1.5 px-2">Kategorie</th>
                <th className="text-left py-1.5 px-2">Bezeichnung</th>
                <th className="text-right py-1.5 px-2">Betrag</th>
                <th className="text-left py-1.5 px-2">Rhythmus</th>
                <th className="text-left py-1.5 px-2">Herleitung</th>
              </tr>
            </thead>
            <tbody>
              {result.scenarioItems.map((s) => (
                <tr key={s.id} className="border-b border-border/50">
                  <td className="py-1.5 px-2">{OUTFLOW_CATEGORY_LABELS[s.category] || s.category}</td>
                  <td className="py-1.5 px-2">{s.label}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{fmtEUR(s.amount)}</td>
                  <td className="py-1.5 px-2">{OUTFLOW_INTERVAL_LABELS[s.interval] || s.interval}</td>
                  <td className="py-1.5 px-2 text-muted-foreground">{s.derivation || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}