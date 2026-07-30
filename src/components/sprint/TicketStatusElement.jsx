import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';

const CYCLE = { offen: 'in_arbeit', in_arbeit: 'erledigt', erledigt: 'offen', wartet: 'in_arbeit' };

const VIEW = {
  offen: { word: 'offen', color: RITTLER.textSecondary, dot: RITTLER.line },
  in_arbeit: { word: 'in Arbeit', color: RITTLER.textSecondary, dot: RITTLER.textSecondary },
  wartet: { word: 'wartet', color: STATUS_COLORS.attention, dot: STATUS_COLORS.attention, triangle: true },
  erledigt: { word: 'erledigt', color: RITTLER.black, dot: RITTLER.black, check: true },
};

// U12 — genau EIN Bedienelement für den Status. Klick schaltet weiter,
// "wartet" liegt im Kontextmenü, weil es der seltene Fall ist.
export default function TicketStatusElement({ value = 'offen', onChange, disabled }) {
  const v = VIEW[value] || VIEW.offen;

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(CYCLE[value] || 'in_arbeit')}
        title="Status weiterschalten"
        className="flex items-center gap-2 px-2 py-1 rounded min-h-[32px] disabled:opacity-50 hover:bg-[#f5f5f5] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2d2d2d] focus-visible:ring-offset-2"
      >
        {v.triangle ? (
          <span
            className="w-0 h-0"
            style={{
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderBottom: `10px solid ${v.dot}`,
            }}
          />
        ) : (
          <span
            className="w-3.5 h-3.5 rounded-full flex items-center justify-center"
            style={{ backgroundColor: v.dot }}
          >
            {v.check && <Check className="w-2.5 h-2.5 text-white" strokeWidth={4} />}
          </span>
        )}
        <span className="text-sm font-medium whitespace-nowrap" style={{ color: v.color }}>{v.word}</span>
      </button>

      {!disabled && (
        <DropdownMenu>
          <DropdownMenuTrigger className="p-1 rounded text-[#6b6b6b] hover:bg-[#f5f5f5]" title="Status wählen">
            <ChevronDown className="w-3.5 h-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {Object.keys(VIEW).map((k) => (
              <DropdownMenuItem key={k} onClick={() => onChange(k)}>{VIEW[k].word}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}