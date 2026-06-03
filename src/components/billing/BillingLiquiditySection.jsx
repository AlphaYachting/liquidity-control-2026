import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, AlertTriangle, Info, TrendingUp, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/liquidityUtils';
import BillingInstructionWizard from './BillingInstructionWizard';
import BillingInstructionList from './BillingInstructionList';
import { Alert, AlertDescription } from '@/components/ui/alert';
import PmReminderButton from '@/components/projects/PmReminderButton';

function ProgressCompare({ performancePct, billingPct, paymentPct }) {
  const bars = [
    { label: 'Leistungsfortschritt', value: performancePct, color: 'bg-emerald-500' },
    { label: 'Abrechnungsfortschritt', value: billingPct, color: 'bg-blue-500' },
    { label: 'Zahlungsfortschritt', value: paymentPct, color: 'bg-purple-500' },
  ];
  return (
    <div className="space-y-2 pt-2">
      {bars.map(bar => (
        <div key={bar.label} className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{bar.label}</span>
            <span className="font-medium">{Math.round(bar.value)}%</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${bar.color}`}
              style={{ width: `${Math.min(100, Math.max(0, bar.value))}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function BillingLiquiditySection({
  project, fin, aworkTaskStats, projectBlocks, linkedOrders, selectedPlanId
}) {
  const queryClient = useQueryClient();
  const [showWizard, setShowWizard] = useState(false);

  const { data: allInstructions = [] } = useQuery({
    queryKey: ['billingInstructions'],
    queryFn: () => base44.entities.BillingInstruction.list()
  });

  const projectInstructions = allInstructions.filter(i => i.project_id === project.id);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.BillingInstruction.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['billingInstructions'] })
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.BillingInstruction.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['billingInstructions'] })
  });

  const totalOrderNet = fin?.commercialBaseNet || 0;
  // Use actual VAT from linked orders (weighted avg), fall back to 20%
  const effectiveVatRate = linkedOrders?.length > 0
    ? linkedOrders.reduce((s, o) => s + (Number(o.vat_rate) || 20), 0) / linkedOrders.length
    : 20;
  const totalOrderGross = totalOrderNet * (1 + effectiveVatRate / 100);
  const alreadyInvoicedNet = fin?.adjustedInvoicedNet || 0;
  const alreadyPaidGross = fin?.paidGross || 0;
  const openToInvoiceNet = fin?.openToInvoiceNet || 0;
  const openReceivableGross = fin?.openReceivableGross || 0;

  const billingPct = totalOrderNet > 0 ? (alreadyInvoicedNet / totalOrderNet) * 100 : 0;
  const paymentPct = totalOrderGross > 0 ? (alreadyPaidGross / totalOrderGross) * 100 : 0;

  const aworkProgress = aworkTaskStats?.progress_percent ?? project?.awork_progress_percent ?? null;
  // Weighted average: blocks WITHOUT awork data count as 0%, not ignored
  const blockAvgProgress = projectBlocks.length > 0
    ? projectBlocks.reduce((s, b) => s + (b.awork_progress_percent || 0), 0) / projectBlocks.length
    : null;
  const performancePct = aworkProgress ?? blockAvgProgress ?? 0;
  const performanceBasis = aworkProgress != null ? 'awork' : blockAvgProgress != null ? 'Pakete Ø' : 'unbekannt';

  // Next suggested billing step: amount of ready blocks not yet invoiced
  const nextSuggestedAmount = fin?.invoiceReadyNet || 0;

  // Warnings
  const billingAheadOfPerformance = performancePct > 0 && billingPct > performancePct + 10;
  const performanceAheadOfBilling = performancePct > 0 && performancePct > billingPct + 10;

  const kpis = [
    { label: 'Auftragswert netto', value: formatCurrency(totalOrderNet), sub: null, color: '' },
    { label: 'Abgerechnet netto', value: formatCurrency(alreadyInvoicedNet), sub: `${Math.round(billingPct)}%`, color: 'text-emerald-600' },
    { label: 'Bezahlt brutto', value: formatCurrency(alreadyPaidGross), sub: `${Math.round(paymentPct)}%`, color: 'text-emerald-600' },
    { label: 'Noch offen abrechenbar', value: formatCurrency(openToInvoiceNet), sub: null, color: openToInvoiceNet > 0 ? 'text-amber-600' : 'text-emerald-600' },
    { label: 'Offene Forderung', value: formatCurrency(openReceivableGross), sub: null, color: openReceivableGross > 0 ? 'text-red-600' : 'text-emerald-600' },
    { label: 'Nächster Schritt bereit', value: nextSuggestedAmount > 0 ? formatCurrency(nextSuggestedAmount) : '—', sub: 'aus Paketen', color: nextSuggestedAmount > 0 ? 'text-primary' : '' },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Abrechnung & Liquidität
          </CardTitle>
          <div className="flex items-center gap-2">
            <PmReminderButton project={project} selectedPlanId={selectedPlanId} />
            <Button size="sm" onClick={() => setShowWizard(true)} className="h-8 text-xs">
              <Plus className="w-3.5 h-3.5 mr-1" />
              Abrechnungsanweisung erstellen
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPI grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {kpis.map(kpi => (
            <div key={kpi.label} className="bg-muted/30 rounded-xl p-3">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className={`text-base font-bold mt-0.5 ${kpi.color}`}>{kpi.value}</p>
              {kpi.sub && <p className="text-xs text-muted-foreground">{kpi.sub}</p>}
            </div>
          ))}
        </div>

        {/* Smart hints */}
        {billingAheadOfPerformance && (
          <Alert className="border-red-200 bg-red-50 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
            <AlertDescription className="text-red-800 text-xs">
              Abrechnungsstand liegt über dem Leistungsfortschritt. Bitte prüfen.
            </AlertDescription>
          </Alert>
        )}
        {performanceAheadOfBilling && (
          <Alert className="border-blue-200 bg-blue-50 py-2">
            <Info className="w-3.5 h-3.5 text-blue-600" />
            <AlertDescription className="text-blue-800 text-xs">
              Operativer Fortschritt liegt über dem Abrechnungsstand ({Math.round(performancePct)}% vs. {Math.round(billingPct)}%). Teilrechnung prüfen.
            </AlertDescription>
          </Alert>
        )}

        {/* Instruction list */}
        <BillingInstructionList
          instructions={projectInstructions}
          projectBlocks={projectBlocks}
          onUpdate={(id, data) => updateMutation.mutate({ id, data })}
          onDelete={(id) => deleteMutation.mutate(id)}
          onDuplicate={(instr) => {
            const { id, created_date, updated_date, ...rest } = instr;
            base44.entities.BillingInstruction.create({ ...rest, status: 'draft' })
              .then(() => queryClient.invalidateQueries({ queryKey: ['billingInstructions'] }));
          }}
        />
      </CardContent>

      <BillingInstructionWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        project={project}
        fin={fin}
        aworkTaskStats={aworkTaskStats}
        projectBlocks={projectBlocks}
        linkedOrders={linkedOrders}
        previousInstructions={projectInstructions}
      />
    </Card>
  );
}