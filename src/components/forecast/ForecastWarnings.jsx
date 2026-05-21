import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const SOURCE_LABELS = {
  plan_line: 'Planzeile',
  recurring_contract: 'Vertrag',
  tool_cost: 'Tool',
  receivable: 'Forderung',
  payable: 'Verbindlichkeit',
};

const SOURCE_COLORS = {
  plan_line: 'bg-blue-100 text-blue-700',
  recurring_contract: 'bg-emerald-100 text-emerald-700',
  tool_cost: 'bg-purple-100 text-purple-700',
  receivable: 'bg-amber-100 text-amber-700',
  payable: 'bg-red-100 text-red-700',
};

export default function ForecastWarnings({ warnings }) {
  const [expanded, setExpanded] = useState(false);

  if (!warnings || warnings.length === 0) return null;

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-amber-100/50 transition-colors"
      >
        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <span className="text-sm font-semibold text-amber-800">
          {warnings.length} Forecast-Warnungen — fehlende oder unvollständige Daten
        </span>
        <div className="ml-auto text-amber-600">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-amber-200 px-4 py-3 space-y-2">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-3 text-sm py-1.5 border-b border-amber-100 last:border-0">
              <Badge className={SOURCE_COLORS[w.source_type] || 'bg-gray-100 text-gray-600'}>
                {SOURCE_LABELS[w.source_type] || w.source_type}
              </Badge>
              <span className="font-medium text-amber-900 truncate flex-1">{w.title}</span>
              <span className="text-amber-700 text-xs flex-shrink-0">{w.issue}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}