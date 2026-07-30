import React from 'react';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';

// K4 — Statuspunkt: "Schweigen ist die gute Nachricht".
// Drei Zustände, die sich zusätzlich zur Farbe in der FORM unterscheiden. Kein grüner Punkt.
const LABELS = {
  plan: 'Im Plan',
  attention: 'Aufmerksamkeit',
  critical: 'Handlung nötig',
};

export default function Ampelpunkt({ status = 'plan', className = '' }) {
  const key = LABELS[status] ? status : 'plan';

  if (key === 'attention') {
    return (
      <span
        role="img"
        aria-label={LABELS.attention}
        title={LABELS.attention}
        className={`inline-block flex-shrink-0 ${className}`}
        style={{
          width: 0, height: 0,
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
          borderBottom: `9px solid ${STATUS_COLORS.attention}`,
        }}
      />
    );
  }

  if (key === 'critical') {
    return (
      <span
        role="img"
        aria-label={LABELS.critical}
        title={LABELS.critical}
        className={`inline-flex items-center justify-center flex-shrink-0 text-white font-bold leading-none ${className}`}
        style={{ width: 10, height: 10, backgroundColor: STATUS_COLORS.critical, fontSize: 8 }}
      >
        !
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={LABELS.plan}
      title={LABELS.plan}
      className={`inline-block rounded-full flex-shrink-0 ${className}`}
      style={{ width: 10, height: 10, border: `1.5px solid ${RITTLER.decorGray}`, backgroundColor: 'transparent' }}
    />
  );
}