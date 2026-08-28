import React from 'react';
import { X } from 'lucide-react';
import { RITTLER } from '@/components/sprint/sprintConfig';

// Eine Kopfzeile für alle Zustände — feste Höhe, feste Abstände, ein Schließkreuz.
export default function FensterKopf({ titel, onClose }) {
  return (
    <div
      className="h-[46px] flex items-center justify-between pl-4 pr-[10px]"
      style={{ borderBottom: `1.5px solid ${RITTLER.line}` }}
    >
      <p
        className="text-[11px] font-bold uppercase truncate"
        style={{ letterSpacing: '1.8px', color: RITTLER.textSecondary }}
      >
        {titel}
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Schließen"
        className="w-8 h-8 shrink-0 rounded flex items-center justify-center hover:bg-muted"
      >
        <X style={{ width: 15, height: 15, color: RITTLER.textSecondary }} />
      </button>
    </div>
  );
}