import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/liquidityUtils';
import { TrendingUp, Circle } from 'lucide-react';

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

  return CAL_MONTHS.map(m => ({
    month: m,
    label: CAL_LABELS[m],
    invoiced: invoicedByMonth[m],
    planned: plannedByMonth[m],
    total: invoicedByMonth[m] + plannedByMonth[m],
    isPast: m < TODAY_MONTH,
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
          Ist verrechnet (bis lfd. Monat) + geplant (Pakete &amp; Monatsverträge). Nettobeträge.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
          {monthlyData.map(m => (
            <div
              key={m.month}
              className={`p-3 rounded-xl text-center transition-colors border ${
                m.isCurrent
                  ? 'bg-primary/10 border-primary/30'
                  : m.isPast
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-sky-50 border-sky-200'
              }`}
            >
              <p className="text-xs font-semibold mb-1">{m.label}</p>
              {m.isPast
                ? <TrendingUp className="w-4 h-4 text-emerald-500 mx-auto" />
                : <Circle className="w-4 h-4 text-sky-500 mx-auto" />
              }
              <p className={`text-xs font-medium mt-1 ${m.isPast ? 'text-emerald-600' : 'text-sky-600'}`}>
                {formatCurrency(m.total)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {m.isPast ? 'Ist' : 'geplant'}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}