import React from 'react';
import { RITTLER } from '@/components/sprint/sprintConfig';

// Beschriftete Gruppe: die Frage steht über dem Feld, nicht daneben.
export default function FeldGruppe({ label, children, className = '' }) {
  return (
    <div className={className}>
      <p
        className="text-[9px] font-bold uppercase mb-1"
        style={{ color: RITTLER.textSecondary, letterSpacing: '1.4px' }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}