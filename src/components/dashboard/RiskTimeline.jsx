import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/liquidityUtils';
import { Circle, CalendarClock } from 'lucide-react';

// Fixe Kalenderjahr-Monate 2026 — strikt auf das Planungsjahr bezogen (keine Vorjahresdaten).
const YEAR = 2026;
const CAL_MONTHS = Array.from({ length: 12 }, (_, i) => `${YEAR}-${String(i + 1).padStart(2, '0')}`);
const DE_MONTH_NAMES = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const CAL_LABELS = Object.fromEntries(CAL_MONTHS.map((m, i) => [m, DE_MONTH_NAMES[i]]));
const TODAY_MONTH = new Date().toISOString().slice(0, 7);

// Ehrliche Ist-Zufluss-Timeline 2026:
// - Ist verrechnet: InvoiceRecords nach invoice_date (netto, ohne Storno/Gutschrift)
// - Geplant: offene Abrechnungspakete nach billing_month (gewichtet) + aktive Monatsverträge (ab lfd. Monat)
// Es werden KEINE Abflüsse angezeigt, da hierfür keine verlässlichen Ausgabendaten vorliegen.
function buildMonthlyInflows(invoices = [], blocks = [], contracts = []) {
  const invoicedByMonth = {};
  const plannedByMonth = {};
  CAL_MONTHS.forEach(m => { invoicedByMonth[m] = 0; plannedByMonth[m] = 0; });

  invoices
    .filter(inv => inv.payment_status !== 'cancelled' && !inv.is_credit_note)
    .forEach(inv => {
      const m = (inv.invoice_date || '').slice(0, 7);
      if (invoicedByMonth[m] !== undefined) invoicedByMonth[m] += Number(inv.net_amount) || 0;
    });

  const linkedBlockIds = new Set(invoices.map(i => i.billing_block_id).filter(Boolean));
  blocks.forEach(b => {
    if (b.invoice_readiness_status === 'invoiced' || b.invoice_readiness_status === 'paid') return;
    if (linkedBlockIds.has(b.id)) return;
    const m = b.billing_month;
    if (!m || plannedByMonth[m] === undefined) return;
    const prob = (b.probability_percent ?? 90) / 100;
    plannedByMonth[m] += (Number(b.amount_net) || 0) * prob;
  });

  const activeContracts = contracts.filter(c => c.status === 'active' && c.billing_interval === 'monthly' && Number(c.monthly_fixed_price) > 0);
  CAL_MONTHS.forEach(m => {
    if (m >= TODAY_MONTH) activeContracts.forEach(c => { plannedByMonth[m] += Number(c.monthly_fixed_price) || 0; });
  });

  return CAL_MONTHS
    .filter(m => m >= TODAY_MONTH) // nur aktueller Monat + Zukunft
    .map(m => ({
      month: m,
      label: CAL_LABELS[m],
      invoiced: invoicedByMonth[m],
      planned: plannedByMonth[m],
      total: invoicedByMonth[m] + plannedByMonth[m],
      isCurrent: m === TODAY_MONTH,
    }));
}

export default function RiskTimeline({ invoices = [], blocks = [], contracts = [] }) {
  const monthlyData = buildMonthlyInflows(invoices, blocks, contracts);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Zufluss-Timeline 2026</CardTitle>
        <p className="text-xs text-muted-foreground">
          Ab lfd. Monat · Ist verrechnet + geplant (Pakete &amp; Monatsverträge). Nettobeträge.
        </p>
      </CardHeader>
      <CardContent>
        <div className={`grid gap-2 grid-cols-3 sm:grid-cols-4 lg:grid-cols-6`}>
          {monthlyData.map(m => (
            <div
              key={m.month}
              className={`p-3 rounded-xl text-center transition-colors border ${
                m.isCurrent ? 'bg-primary/10 border-primary/30' : 'bg-sky-50 border-sky-200'
              }`}
            >
              <p className="text-xs font-semibold mb-1">
                {m.label}{m.isCurrent && <span className="text-[9px] text-primary ml-1">akt.</span>}
              </p>
              {m.isCurrent
                ? <CalendarClock className="w-4 h-4 text-primary mx-auto" />
                : <Circle className="w-4 h-4 text-sky-500 mx-auto" />
              }
              <p className={`text-xs font-bold mt-1 ${m.isCurrent ? 'text-primary' : 'text-sky-700'}`}>
                {formatCurrency(m.total)}
              </p>
              <div className="mt-1 space-y-0.5">
                {m.invoiced > 0 && (
                  <p className="text-[10px] text-emerald-600">Ist {formatCurrency(m.invoiced)}</p>
                )}
                {m.planned > 0 && (
                  <p className="text-[10px] text-sky-600">Plan {formatCurrency(m.planned)}</p>
                )}
                {m.total === 0 && <p className="text-[10px] text-muted-foreground">–</p>}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}