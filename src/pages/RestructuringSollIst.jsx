import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/ui/skeleton';
import { useRestructuringData } from '@/lib/restructuring/useRestructuringData';
import { build13Week } from '@/lib/restructuring/restructuringEngine';
import { buildSollIst } from '@/lib/restructuring/sollIst';
import { saveWeeklyActual } from '@/lib/restructuring/weeklyActualSave';
import { fmtEUR, fmtPct, fmtDate } from '@/lib/restructuring/restructuringFormat';
import { exportPDF, exportExcel } from '@/lib/restructuring/restructuringExport';
import ReportCard from '@/components/restructuring/ReportCard';
import SollIstRow from '@/components/restructuring/sollist/SollIstRow';
import SollIstSummary from '@/components/restructuring/sollist/SollIstSummary';

const SOURCE = 'Wochenrechnung (Plan) — Kontoauszug (Ist)';

const COLUMNS = [
  'Woche', 'Zeitraum', 'PLAN Einzahlungen', 'IST Einzahlungen', 'Abweichung',
  'PLAN Auszahlungen', 'IST Auszahlungen', 'Abweichung', 'PLAN Endbestand',
  'IST Kontostand', 'Abweichung', 'Bemerkung',
];

export default function RestructuringSollIst() {
  const qc = useQueryClient();
  const { data, isLoading } = useRestructuringData();
  const [savingWeek, setSavingWeek] = useState(null);

  const { data: plans } = useQuery({
    queryKey: ['cashflow-plans'],
    queryFn: () => base44.entities.CashflowPlan.list('-created_date', 50),
  });
  const planId = useMemo(() => {
    const active = (plans || []).find((p) => p.status === 'active');
    return active?.id || plans?.[0]?.id || 'default';
  }, [plans]);

  const { data: actuals } = useQuery({
    queryKey: ['weekly-actuals', planId],
    queryFn: () => base44.entities.WeeklyActual.filter({ plan_id: planId }),
    enabled: !!planId,
  });

  const week13 = useMemo(() => (data ? build13Week({ ...data, setting: data.setting }) : null), [data]);

  const model = useMemo(() => {
    if (!week13) return null;
    return buildSollIst({
      weekRows: week13.rows,
      actuals: actuals || [],
      hearingDate: data?.setting?.reporting_hearing_date || null,
    });
  }, [week13, actuals, data]);

  if (isLoading || !model) {
    return <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-96" /></div>;
  }

  const hearingDate = data?.setting?.reporting_hearing_date || null;

  const handleSave = async (row, values) => {
    setSavingWeek(row.week_index);
    try {
      await saveWeeklyActual({
        planId,
        weekIndex: row.week_index,
        weekEnd: row.week_end,
        values,
        existing: row.actual,
        userEmail: (await base44.auth.me().catch(() => null))?.email,
      });
      await qc.invalidateQueries({ queryKey: ['weekly-actuals', planId] });
      await qc.invalidateQueries({ queryKey: ['restructuring-data'] });
    } finally {
      setSavingWeek(null);
    }
  };

  const cell = (v) => (v === null || v === undefined ? '' : fmtEUR(v));
  const pct = (v) => (v === null ? '' : fmtPct(v));
  const exportRows = model.rows.map((r) => [
    `W${r.week_index}`, `${fmtDate(r.week_start)} – ${fmtDate(r.week_end)}`,
    cell(r.plan_inflow), cell(r.actual_inflow), pct(r.var_inflow),
    cell(r.plan_outflow), cell(r.actual_outflow), pct(r.var_outflow),
    cell(r.plan_closing), cell(r.actual_balance), pct(r.var_balance),
    r.variance_reason,
  ]);
  const t = model.totals;
  const summaryLines = [
    `Nachweiszeitraum bis Berichtstagsatzung ${fmtDate(hearingDate)}: ${model.proofWeeks} Wochen`,
    `Plan Einzahlungen: ${fmtEUR(t.plan_inflow)} — Ist Einzahlungen: ${t.actual_inflow === null ? 'keine Erfassung' : fmtEUR(t.actual_inflow)}`,
    `Plan Auszahlungen: ${fmtEUR(t.plan_outflow)} — Ist Auszahlungen: ${t.actual_outflow === null ? 'keine Erfassung' : fmtEUR(t.actual_outflow)}`,
    `Plan Überschuss: ${fmtEUR(t.plan_surplus)} — Plan Deckungsgrad: ${t.plan_coverage === null ? 'nicht berechenbar' : fmtPct(t.plan_coverage)}`,
    `IST-ÜBERSCHUSS: ${t.actual_surplus === null ? 'keine Erfassung' : fmtEUR(t.actual_surplus)}`,
    `IST-DECKUNGSGRAD: ${t.actual_coverage === null ? 'keine Erfassung' : fmtPct(t.actual_coverage)}`,
  ];

  const lastProofWeek = [...model.rows].reverse().find((r) => r.in_proof_period)?.week_index || null;

  return (
    <div className="space-y-4">
      <ReportCard
        title="Soll-Ist-Cockpit — Planwochen gegen Kontoauszug"
        sourceNote={SOURCE}
        onExportPDF={() => exportPDF('Soll-Ist-Cockpit', COLUMNS, exportRows, {
          sourceNote: SOURCE, numericCols: [2, 3, 4, 5, 6, 7, 8, 9, 10], summaryLines,
        })}
        onExportExcel={() => exportExcel('Soll-Ist-Cockpit', COLUMNS, exportRows, SOURCE)}
      >
        <p className="text-[11px] text-muted-foreground mb-3">
          Plan-Spalten stammen aus der Wochenrechnung und sind nicht editierbar. Ist-Werte und Bemerkung werden je Woche
          direkt in der Tabelle erfasst. Nicht erfasste Wochen bleiben leer und werden nicht als 0 gerechnet.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                {COLUMNS.map((c, i) => (
                  <th key={c + i} className={`px-2 py-2 font-medium ${i >= 2 && i <= 10 ? 'text-right' : 'text-left'}`}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.rows.map((r) => (
                <React.Fragment key={r.week_index}>
                  <SollIstRow row={r} onSave={handleSave} saving={savingWeek === r.week_index} />
                  {lastProofWeek === r.week_index && (
                    <tr className="bg-slate-900 text-white">
                      <td colSpan={COLUMNS.length} className="px-2 py-1.5 text-[11px] font-medium">
                        bis hier ist am {fmtDate(hearingDate)} alles Ist — darunter beginnt die Prognose
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </ReportCard>

      <ReportCard title="Nachweiszeitraum — Summenblock" sourceNote={SOURCE}>
        <SollIstSummary
          totals={model.totals}
          hearingDate={hearingDate}
          proofWeeks={model.proofWeeks}
          recordedWeeks={model.recordedWeeks}
        />
      </ReportCard>
    </div>
  );
}