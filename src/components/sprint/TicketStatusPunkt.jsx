import React from 'react';
import { Check } from 'lucide-react';
import { STATUS_COLORS, RITTLER } from '@/components/sprint/sprintConfig';

// Statusträger einer Aufgabe: Form + Farbe, das Wort steht in der Zeile daneben.
export default function TicketStatusPunkt({ status }) {
  if (status === 'erledigt') {
    return (
      <span
        className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: RITTLER.black }}
      >
        <Check className="w-2.5 h-2.5 text-white" strokeWidth={4} />
      </span>
    );
  }
  if (status === 'wartet') {
    return (
      <span
        className="flex-shrink-0"
        style={{
          width: 0, height: 0,
          borderLeft: '7px solid transparent',
          borderRight: '7px solid transparent',
          borderBottom: `12px solid ${STATUS_COLORS.attention}`,
        }}
      />
    );
  }
  return (
    <span
      className="w-4 h-4 rounded-full flex-shrink-0"
      style={{ backgroundColor: status === 'in_arbeit' ? STATUS_COLORS.neutral : RITTLER.line }}
    />
  );
}