import React from 'react';
import { ChevronDown, ChevronRight, ArrowUpRight, ArrowDownRight, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, getMonthLabel } from '@/lib/liquidityUtils';

const SOURCE_LABELS = {
  plan_line: 'Planzeile',
  recurring_contract: 'Vertrag',
  tool_cost: 'Tool',
  receivable: 'Forderung',
  payable: 'Verbindlichkeit',
  invoice_record: 'Rechnung',
  billing_instruction: 'Abrechnung geplant',
  open_order: 'Restauftrag',
};

const SOURCE_COLORS = {
  plan_line: 'bg-blue-100 text-blue-700',
  recurring_contract: 'bg-emerald-100 text-emerald-700',
  tool_cost: 'bg-purple-100 text-purple-700',
  receivable: 'bg-amber-100 text-amber-700',
  payable: 'bg-red-100 text-red-700',
  invoice_record: 'bg-indigo-100 text-indigo-700',
  billing_instruction: 'bg-sky-100 text-sky-700',
  open_order: 'bg-violet-100 text-violet-700',
};

const STATUS_COLORS = {
  paid: 'bg-emerald-100 text-emerald-700',
  invoiced: 'bg-emerald-100 text-emerald-700',
  planned: 'bg-blue-100 text-blue-700',
  overdue: 'bg-red-100 text-red-700',
  uncertain: 'bg-amber-100 text-amber-700',
  open: 'bg-sky-100 text-sky-700',
};

function ItemRow({ item }) {
  const isOutflow = item.direction === 'outflow';
  const pct = item.probability_percent;
  const showProb = pct !== undefined && pct !== 100;

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/40 text-sm">
      <div className={`w-1.5 h-10 rounded-full flex-shrink-0 ${isOutflow ? 'bg-red-400' : 'bg-emerald-400'}`} />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate text-sm">{item.title}</p>
        {item.notes && <p className="text-xs text-muted-foreground truncate">{item.notes}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Badge className={SOURCE_COLORS[item.source_type] || 'bg-gray-100 text-gray-600'}>
          {SOURCE_LABELS[item.source_type] || item.source_type}
        </Badge>
        {item.status && (
          <Badge className={STATUS_COLORS[item.status] || 'bg-gray-100 text-gray-600'}>
            {item.status}
          </Badge>
        )}
        {showProb && (
          <span className="text-xs text-muted-foreground">{pct}%</span>
        )}
        <div className="text-right min-w-[90px]">
          <p className={`font-semibold text-sm ${isOutflow ? 'text-red-600' : 'text-emerald-700'}`}>
            {isOutflow ? '−' : '+'}{formatCurrency(item.amount)}
          </p>
          {showProb && (
            <p className="text-xs text-muted-foreground">{formatCurrency(item.weighted_amount)} gewichtet</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ForecastMonthDrillDown({ monthData, isOpen, onToggle }) {
  const { month, weighted_inflow, weighted_outflow, weighted_net_cashflow, closing, inflow_items, outflow_items, risk_flags } = monthData;
  const hasRisk = risk_flags && risk_flags.length > 0;
  const isNegative = weighted_net_cashflow < 0;

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${hasRisk ? 'border-red-200' : 'border-border'}`}>
      {/* Header row */}
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors ${hasRisk ? 'bg-red-50/50' : ''}`}
      >
        <div className="flex-shrink-0 text-muted-foreground">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>

        <div className="font-semibold text-sm w-10">{getMonthLabel(month)}</div>

        <div className="flex items-center gap-1 text-emerald-700 text-sm min-w-[90px]">
          <ArrowUpRight className="w-3 h-3" />
          <span>{formatCurrency(weighted_inflow)}</span>
        </div>

        <div className="flex items-center gap-1 text-red-600 text-sm min-w-[90px]">
          <ArrowDownRight className="w-3 h-3" />
          <span>{formatCurrency(weighted_outflow)}</span>
        </div>

        <div className={`font-semibold text-sm min-w-[90px] ${isNegative ? 'text-red-700' : 'text-foreground'}`}>
          Net: {formatCurrency(weighted_net_cashflow)}
        </div>

        <div className="text-xs text-muted-foreground min-w-[90px]">
          Saldo: {formatCurrency(closing)}
        </div>

        <div className="flex gap-1 flex-wrap ml-auto">
          {risk_flags.map((f, i) => (
            <Badge key={i} className="bg-red-100 text-red-700 text-xs">
              <AlertTriangle className="w-3 h-3 mr-1" />{f}
            </Badge>
          ))}
          <Badge variant="outline" className="text-xs">{inflow_items.length + outflow_items.length} Positionen</Badge>
        </div>
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className="border-t px-2 py-3 space-y-3 bg-muted/10">
          {inflow_items.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-emerald-700 px-3 mb-1">
                Zuflüsse ({inflow_items.length}) — {formatCurrency(weighted_inflow)}
              </p>
              {inflow_items.map((item, i) => <ItemRow key={i} item={item} />)}
            </div>
          )}
          {outflow_items.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-700 px-3 mb-1">
                Abflüsse ({outflow_items.length}) — {formatCurrency(weighted_outflow)}
              </p>
              {outflow_items.map((item, i) => <ItemRow key={i} item={item} />)}
            </div>
          )}
          {inflow_items.length === 0 && outflow_items.length === 0 && (
            <p className="text-sm text-muted-foreground px-3 py-2">Keine Positionen für diesen Monat.</p>
          )}
        </div>
      )}
    </div>
  );
}