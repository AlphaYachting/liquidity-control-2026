import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wand2, Info } from 'lucide-react';
import { buildPlanSuggestions } from '@/lib/restructuring/planSuggestions';

const SOURCE_LABELS = {
  invoice: 'Rechnungen',
  billing_instruction: 'Abrechnungsanweisungen',
  order: 'Auftragsreste',
  contract: 'Verträge',
};

export default function SuggestionRunPanel({ plan, existingItems, defaultVatRate, onDone }) {
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState(null);

  const run = async () => {
    setRunning(true);
    setSummary(null);
    const [invoices, instructions, orders, projects, contracts] = await Promise.all([
      base44.entities.InvoiceRecord.list(),
      base44.entities.BillingInstruction.list(),
      base44.entities.ConfirmedOrder.list(),
      base44.entities.LiquidityProject.list(),
      base44.entities.RecurringContract.list(),
    ]);
    const { suggestions, summary: sum } = buildPlanSuggestions({
      plan, existingItems, invoices, instructions, orders, projects, contracts,
      defaultVatRate,
    });
    if (suggestions.length > 0) {
      await base44.entities.CashflowPlanItem.bulkCreate(suggestions);
    }
    setSummary(sum);
    setRunning(false);
    onDone();
  };

  return (
    <Card className="p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold">Positionen aus Systemdaten vorschlagen</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Kaskade ohne Doppelzählung: offene Rechnungen → freigegebene Abrechnungen → nicht fakturierte Auftragsreste → aktive Verträge.
            Vorschläge werden als Entwurf angelegt und einzeln bestätigt; bereits bestätigte Positionen werden nicht erneut erzeugt.
          </p>
        </div>
        <Button size="sm" onClick={run} disabled={running} className="flex-shrink-0">
          <Wand2 className="w-3.5 h-3.5 mr-1" /> {running ? 'Läuft…' : 'Vorschlagen'}
        </Button>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground mt-3 border-t pt-3">
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        Regie und Support werden bewusst nicht automatisch vorgeschlagen — laufend verrechnete Regiearbeit ist weder Vertrag noch Auftrag.
        Die Kategorie „Regie / Support" wird manuell gepflegt.
      </p>

      {summary && (
        <div className="mt-3 border-t pt-3 text-xs">
          <p className="font-semibold mb-1.5">{summary.total} neue Entwürfe erzeugt ({summary.skipped} bereits vorhanden, übersprungen)</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-muted-foreground">
            {Object.entries(SOURCE_LABELS).map(([k, l]) => (
              <span key={k}>{l}: <span className="font-semibold text-foreground tabular-nums">{summary[k]}</span></span>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1.5">
            <span className="text-amber-700">Alt/Neu-Split zu prüfen: <span className="font-semibold tabular-nums">{summary.needs_split_review}</span></span>
            <span className="text-red-700">ohne Termin: <span className="font-semibold tabular-nums">{summary.missing_date}</span></span>
          </div>
        </div>
      )}
    </Card>
  );
}