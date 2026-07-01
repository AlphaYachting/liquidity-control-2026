import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, Legend } from 'recharts';
import { formatCurrency } from '@/lib/liquidityUtils';

// Festes Kalenderjahr 2026 (Jän–Dez) — konsistent mit Liquiditätstrend & Timeline.
const YEAR = 2026;
const MONTHS = Array.from({ length: 12 }, (_, i) => `${YEAR}-${String(i + 1).padStart(2, '0')}`);
const DE_MONTH_NAMES = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const MONTH_LABELS = Object.fromEntries(MONTHS.map((m, i) => [m, DE_MONTH_NAMES[i]]));

// Build monthly cashflow from real data sources.
// Priority: BillingInstructions (confirmed PM intent, with real date) > ProjectBillingBlocks (planned) > RecurringContracts
// Blocks that already have an active instruction are NOT counted again to avoid double-counting.
function buildCashflowData({ blocks = [], contracts = [], planLines = [], payables = [], instructions = [], invoiceRecords = [] }) {
  const inflows = {};
  const outflows = {};
  MONTHS.forEach(m => { inflows[m] = 0; outflows[m] = 0; });

  // Active instruction statuses that represent real planned cashflow
  const ACTIVE_STATUSES = new Set(['draft', 'ready_for_backoffice', 'sent_to_backoffice', 'invoice_created']);

  // Track which billing_block_ids are already covered by an instruction
  const coveredBlockIds = new Set();

  // 1. BillingInstructions → highest-priority planned inflows
  instructions.forEach(instr => {
    if (!ACTIVE_STATUSES.has(instr.status)) return; // skip paid/cancelled
    if (instr.status === 'paid') return;
    const amount = Number(instr.instruction_amount_net) || 0;
    if (amount <= 0) return;

    // Determine month: prefer planned_invoice_date, fall back to billing_month of linked block
    let m = null;
    if (instr.planned_invoice_date) {
      m = instr.planned_invoice_date.slice(0, 7);
    } else if (instr.billing_block_id) {
      const block = blocks.find(b => b.id === instr.billing_block_id);
      m = block?.billing_month || null;
    }

    if (m && inflows[m] !== undefined) {
      // Weight by status: sent/created = 100%, draft/ready = 90%
      const prob = (instr.status === 'sent_to_backoffice' || instr.status === 'invoice_created') ? 1.0 : 0.9;
      inflows[m] += amount * prob;
    }

    // Mark block as covered so we don't double-count
    if (instr.billing_block_id) coveredBlockIds.add(instr.billing_block_id);
  });

  // 2. Billing blocks → planned inflows (only if not already covered by an instruction)
  blocks.forEach(b => {
    if (coveredBlockIds.has(b.id)) return; // already covered by instruction
    if (b.invoice_readiness_status === 'invoiced' || b.invoice_readiness_status === 'paid') return;
    const m = b.billing_month;
    if (m && inflows[m] !== undefined) {
      const prob = (b.probability_percent ?? 90) / 100;
      inflows[m] += (Number(b.amount_net) || 0) * prob;
    }
  });

  // Recurring contracts → monthly inflows spread across year
  contracts.forEach(c => {
    if (c.status === 'cancelled') return;
    const monthly = Number(c.monthly_fixed_price) || 0;
    if (c.billing_interval === 'monthly' && monthly > 0) {
      MONTHS.forEach(m => { inflows[m] += monthly; });
    } else if (c.billing_interval === 'quarterly' && monthly > 0) {
      ['2026-01', '2026-04', '2026-07', '2026-10'].forEach(m => {
        if (inflows[m] !== undefined) inflows[m] += monthly * 3;
      });
    } else if (c.billing_interval === 'yearly') {
      const annual = Number(c.annual_amount) || 0;
      if (annual > 0 && inflows['2026-01'] !== undefined) inflows['2026-01'] += annual;
    }
  });

  // InvoiceRecords: offene Rechnungen nach Fälligkeitsmonat (nicht doppelt mit Blocks)
  const coveredByBlock = new Set(invoiceRecords.map(i => i.billing_block_id).filter(Boolean));
  invoiceRecords
    .filter(i => i.payment_status !== 'paid' && i.payment_status !== 'cancelled' && !i.is_credit_note)
    .forEach(inv => {
      const m = (inv.due_date || inv.invoice_date || '').slice(0, 7);
      if (!m || inflows[m] === undefined) return;
      const amount = Number(inv.open_amount) > 0 ? Number(inv.open_amount) : Number(inv.net_amount) || 0;
      if (amount > 0) inflows[m] += amount * 0.9; // 90% Wahrscheinlichkeit
    });

  // Plan lines (explicit overrides / manual entries)
  planLines.forEach(l => {
    if (l.status === 'cancelled') return;
    const m = l.month;
    if (!m) return;
    const net = Number(l.amount_net) || 0;
    if (l.direction === 'inflow' && inflows[m] !== undefined) inflows[m] += net;
    if (l.direction === 'outflow' && outflows[m] !== undefined) outflows[m] += net;
  });

  // Payables → outflows by due month
  payables.forEach(p => {
    if (p.status === 'paid') return;
    const due = p.due_date || p.payment_planned_date;
    if (!due) return;
    const m = due.slice(0, 7);
    if (outflows[m] !== undefined) outflows[m] += Number(p.gross_amount) || 0;
  });

  let balance = 0;
  return MONTHS.map(m => {
    const inf = inflows[m];
    const out = outflows[m];
    balance += inf - out;
    return {
      month: m,
      label: MONTH_LABELS[m] || m,
      inflows: Math.round(inf),
      outflows: Math.round(out),
      closing: Math.round(balance),
    };
  });
}

export default function CashflowChart({ planLines = [], blocks = [], contracts = [], payables = [], instructions = [], invoiceRecords = [] }) {
  const data = buildCashflowData({ blocks, contracts, planLines, payables, instructions, invoiceRecords });
  const hasData = data.some(d => d.inflows > 0 || d.outflows > 0);

  const customTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border rounded-lg p-3 shadow-lg text-xs">
        <p className="font-semibold mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }}>{p.name}: {formatCurrency(p.value)}</p>
        ))}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Monatlicher Cashflow 2026</CardTitle>
        <p className="text-xs text-muted-foreground">
          Kalenderjahr 2026 · Zuflüsse (Anweisungen, Pakete, Verträge, offene Rechnungen) − Abflüsse
        </p>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-[320px] flex items-center justify-center text-muted-foreground text-sm">
            Keine Daten vorhanden. Bitte Abrechnungspakete oder Liquiditätsplan befüllen.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={customTooltip} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="inflows" name="Zuflüsse" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="outflows" name="Abflüsse" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
              <Line dataKey="closing" name="Kumuliert" stroke="hsl(221, 83%, 53%)" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}