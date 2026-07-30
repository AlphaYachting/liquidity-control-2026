import React from 'react';
import { Circle, Play, Clock, Check } from 'lucide-react';
import { TICKET_STATUS_LABELS } from '@/components/sprint/sprintConfig';

// Ein-Klick-Statusschalter statt Select-Feld — Statusachse B, kein Pink.
const OPTIONS = [
  { key: 'offen', Icon: Circle, active: 'bg-[#6b6b6b] text-white border-[#6b6b6b]' },
  { key: 'in_arbeit', Icon: Play, active: 'bg-[#2d2d2d] text-white border-[#2d2d2d]' },
  { key: 'wartet', Icon: Clock, active: 'bg-[#9c5b00] text-white border-[#9c5b00]' },
  { key: 'erledigt', Icon: Check, active: 'bg-[#45d085] text-[#12351f] border-[#45d085]' },
];

export default function TicketStatusSchalter({ value, onChange, disabled }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Status">
      {OPTIONS.map(({ key, Icon, active }) => {
        const isActive = value === key;
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            title={TICKET_STATUS_LABELS[key]}
            aria-label={TICKET_STATUS_LABELS[key]}
            aria-pressed={isActive}
            onClick={() => !isActive && onChange(key)}
            className={`h-8 rounded border transition-colors flex items-center gap-1.5 px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d2d2d] disabled:opacity-40 disabled:cursor-not-allowed ${
              isActive ? active : 'bg-white border-[#e0e0e0] text-[#6b6b6b] hover:border-[#2d2d2d] hover:text-[#2d2d2d]'
            }`}
          >
            <Icon className="w-4 h-4" />
            {isActive && <span className="text-[11px] font-bold uppercase tracking-wide">{TICKET_STATUS_LABELS[key]}</span>}
          </button>
        );
      })}
    </div>
  );
}