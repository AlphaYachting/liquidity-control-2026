import React, { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, FileText, Sheet } from 'lucide-react';
import { useRestructuringData } from '@/lib/restructuring/useRestructuringData';
import { buildOrderDerivation } from '@/lib/restructuring/orderDerivation';
import { derivationExportRows, DERIVATION_SOURCE } from '@/lib/restructuring/derivationExport';
import { exportPDF, exportExcel } from '@/lib/restructuring/restructuringExport';
import { fmtEUR } from '@/lib/restructuring/restructuringFormat';
import OrderDerivationStep from './OrderDerivationStep';

/**
 * "Herleitung aus dem Auftragsbestand" — erklärt die Differenz zwischen
 * Projekt-Cockpit (was abgerechnet werden darf) und Geldflussrechnung
 * (was im Planhorizont auf dem Konto ankommt).
 */
export default function OrderDerivationPanel({ plan, items = [], patterns = [] }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useRestructuringData();

  const derivation = useMemo(() => {
    if (!data) return null;
    const pattern = patterns.find((p) => p.id === data.setting?.default_payment_pattern_id)
      || patterns.find((p) => p.is_default) || null;
    return buildOrderDerivation({
      orders: data.orders, projects: data.projects, invoices: data.invoices,
      setting: data.setting, plan, planItems: items, pattern,
    });
  }, [data, plan, items, patterns]);

  const doExport = (kind) => {
    const { columns, rows, summary } = derivationExportRows(derivation);
    if (kind === 'pdf') {
      exportPDF('Herleitung aus dem Auftragsbestand', columns, rows, {
        sourceNote: DERIVATION_SOURCE, numericCols: [2], summaryLines: summary,
      });
    } else {
      exportExcel('Herleitung aus dem Auftragsbestand', columns, rows, DERIVATION_SOURCE);
    }
  };

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-muted/40"
      >
        <div>
          <h2 className="text-sm font-bold flex items-center gap-1.5">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Herleitung aus dem Auftragsbestand
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5 pl-5">
            Warum Projekt-Cockpit und Geldflussrechnung unterschiedliche Zahlen zeigen — in sechs Schritten.
          </p>
        </div>
        {derivation && (
          <span className="text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
            {fmtEUR(derivation.backlogNet)} → {fmtEUR(derivation.cashInHorizon)}
          </span>
        )}
      </button>

      {open && (
        <div className="px-4 pb-4">
          {isLoading || !derivation ? (
            <p className="text-xs text-muted-foreground py-4">Daten werden geladen …</p>
          ) : (
            <>
              <div className="border-t pt-1">
                {derivation.steps.map((s) => <OrderDerivationStep key={s.key} step={s} />)}
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">
                Das Projekt-Cockpit zeigt Schritt 1 (was abgerechnet werden darf), die Geldflussrechnung Schritt 6
                (was im Planhorizont auf dem Konto ankommt). Jeder Zwischenschritt ist auf die zugrunde liegenden
                Aufträge aufklappbar und von dort in die Projektübersicht verlinkt.
              </p>
              <div className="flex gap-2 mt-3">
                <Button variant="outline" size="sm" className="h-8" onClick={() => doExport('pdf')}>
                  <FileText className="w-3.5 h-3.5 mr-1.5" /> PDF
                </Button>
                <Button variant="outline" size="sm" className="h-8" onClick={() => doExport('excel')}>
                  <Sheet className="w-3.5 h-3.5 mr-1.5" /> Excel
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}