import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle } from 'lucide-react';
import ReportCard from '@/components/restructuring/ReportCard';
import ReportTable from '@/components/restructuring/ReportTable';
import { fmtEUR, fmtPct, fmtDate } from '@/lib/restructuring/restructuringFormat';
import { exportPDF, exportExcel } from '@/lib/restructuring/restructuringExport';
import { buildContinuationProof } from '@/lib/restructuring/continuationProof';
import ContinuationKpiBlock from '@/components/restructuring/continuation/ContinuationKpiBlock';
import ContinuationScenarioBlock from '@/components/restructuring/continuation/ContinuationScenarioBlock';
import ContinuationExplainer from '@/components/restructuring/continuation/ContinuationExplainer';

const COLUMNS = [
  'Woche', 'Zeitraum', 'Auszahlungen (Masse)', 'Einzahlungen NEU', 'Saldo der Woche',
  'kum. Auszahlungen', 'kum. Einzahlungen NEU', 'kumulierte Lücke', 'Deckungsgrad kumuliert',
];

export default function RestructuringFortfuehrung() {
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      const [plans, patterns, settings] = await Promise.all([
        base44.entities.CashflowPlan.filter({ status: 'active' }),
        base44.entities.PaymentPattern.list(),
        base44.entities.RestructuringSetting.list(),
      ]);
      const plan = plans[0] || null;
      const items = plan
        ? (await base44.entities.CashflowPlanItem.filter({ plan_id: plan.id })).filter((i) => !i.is_draft)
        : [];
      setData({ plan, items, patterns, setting: settings[0] || null });
    })();
  }, []);

  const proof = useMemo(
    () => (data?.plan ? buildContinuationProof(data) : null),
    [data],
  );

  if (!data) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>;

  if (!data.plan) {
    return (
      <Card className="p-6 text-center">
        <AlertTriangle className="w-5 h-5 mx-auto text-amber-600" />
        <p className="text-sm font-semibold mt-2">Kein aktiver Geldflussplan vorhanden</p>
        <p className="text-xs text-muted-foreground mt-1">Der Fortführungsnachweis rechnet auf den Positionen des aktiven Plans.</p>
      </Card>
    );
  }

  const rowValues = (r) => [
    `W${r.index}`,
    `${fmtDate(r.start)} – ${fmtDate(r.end)}`,
    fmtEUR(r.outflow_masse),
    fmtEUR(r.inflow_neu),
    fmtEUR(r.net),
    fmtEUR(r.cum_outflow),
    fmtEUR(r.cum_inflow),
    fmtEUR(r.cum_gap),
    r.coverage_percent === null ? '—' : fmtPct(r.coverage_percent),
  ];

  const summaryLines = [
    `Deckungsgrad bis Berichtstagsatzung: ${proof.base.coverage_until_hearing === null ? 'nicht berechenbar' : fmtPct(proof.base.coverage_until_hearing)}`,
    `Lücke bis Berichtstagsatzung: ${proof.base.gap_until_hearing === null ? '—' : fmtEUR(proof.base.gap_until_hearing)}`,
    `Deckungsgrad volle Planwochen: ${proof.base.coverage_full === null ? 'nicht berechenbar' : fmtPct(proof.base.coverage_full)}`,
    `Ergebnis volle Planwochen: ${proof.base.result_full === null ? '—' : fmtEUR(proof.base.result_full)}`,
    `Umschlagpunkt: ${proof.base.turning_point ? `Woche ${proof.base.turning_point}` : 'im Planhorizont nicht erreicht'}`,
    `Szenariosumme (nicht im Plan enthalten): ${fmtEUR(proof.scenario.total)}, davon bis Berichtstagsatzung ${fmtEUR(proof.scenario.until_hearing)}`,
  ];

  const columns = [
    { key: 'index', label: 'Woche', render: (r) => (
      <span className="font-semibold">W{r.index}{r.is_hearing_week && <span className="ml-1.5 text-[10px] font-semibold text-purple-700">Berichtstagsatzung</span>}</span>
    ) },
    { key: 'period', label: 'Zeitraum', render: (r) => `${fmtDate(r.start)} – ${fmtDate(r.end)}` },
    { key: 'outflow_masse', label: 'Auszahlungen (Masse)', align: 'right', render: (r) => fmtEUR(r.outflow_masse) },
    { key: 'inflow_neu', label: 'Einzahlungen NEU', align: 'right', render: (r) => fmtEUR(r.inflow_neu) },
    { key: 'net', label: 'Saldo der Woche', align: 'right', render: (r) => (
      <span className={r.net < 0 ? 'text-red-700' : 'text-emerald-700'}>{fmtEUR(r.net)}</span>
    ) },
    { key: 'cum_outflow', label: 'kum. Auszahlungen', align: 'right', render: (r) => fmtEUR(r.cum_outflow) },
    { key: 'cum_inflow', label: 'kum. Einzahlungen NEU', align: 'right', render: (r) => fmtEUR(r.cum_inflow) },
    { key: 'cum_gap', label: 'kumulierte Lücke', align: 'right', render: (r) => (
      <span className={r.cum_gap < 0 ? 'text-red-700 font-semibold' : 'text-emerald-700 font-semibold'}>{fmtEUR(r.cum_gap)}</span>
    ) },
    { key: 'coverage_percent', label: 'Deckungsgrad kumuliert', align: 'right', render: (r) => (r.coverage_percent === null ? '—' : fmtPct(r.coverage_percent)) },
  ];

  return (
    <div className="space-y-4">
      <ReportCard
        title="Fortführungsnachweis — Selbsttragfähigkeit ab dem Stichtag"
        sourceNote="Positionen des aktiven Geldflussplans, ausschließlich Neuanteile und Masseverbindlichkeiten"
        onExportPDF={() => exportPDF('Fortfuehrungsnachweis', COLUMNS, proof.rows.map(rowValues), {
          sourceNote: 'Aktiver Geldflussplan — nur Neuleistung gegen Masseverbindlichkeiten',
          summaryLines,
          numericCols: [2, 3, 4, 5, 6, 7, 8],
        })}
        onExportExcel={() => exportExcel('Fortfuehrungsnachweis', COLUMNS, proof.rows.map(rowValues),
          'Aktiver Geldflussplan — nur Neuleistung gegen Masseverbindlichkeiten')}
      >
        <p className="text-[11px] text-muted-foreground mb-3">
          Maßgeblich ist nicht der Kontostand, sondern ob der fortgeführte Betrieb aus dem, was er ab dem Stichtag selbst
          erwirtschaftet, seine eigenen laufenden Verbindlichkeiten deckt.
          {proof.hearingDate && <> Berichtstagsatzung am {fmtDate(proof.hearingDate)}{proof.hearingWeek ? ` (Woche ${proof.hearingWeek})` : ' — außerhalb des Planhorizonts'}.</>}
          {proof.unscheduled > 0 && <> {proof.unscheduled} Positionen ohne Termin oder Planwoche konnten nicht zugeordnet werden.</>}
        </p>
        <ReportTable
          columns={columns}
          rows={proof.rows}
          rowClassName={(r) => (r.is_hearing_week ? 'bg-purple-50' : '')}
        />
        {proof.hearingWeek && (
          <p className="text-[11px] text-purple-700 mt-2">Berichtstagsatzung — auf diese Zeile kommt es an.</p>
        )}
      </ReportCard>

      <Card className="p-4">
        <ContinuationKpiBlock
          title="Ergebnis (Basisplan)"
          kpis={proof.base}
          hearingWeek={proof.hearingWeek}
          weekCount={proof.weekCount}
        />
      </Card>

      <Card className="p-4 space-y-4">
        <ContinuationScenarioBlock scenario={proof.scenario} hearingWeek={proof.hearingWeek} />
        <ContinuationKpiBlock
          title="Ergebnis inklusive dieser Massekosten"
          kpis={proof.scenario}
          hearingWeek={proof.hearingWeek}
          weekCount={proof.weekCount}
        />
      </Card>

      <ContinuationExplainer />
    </div>
  );
}