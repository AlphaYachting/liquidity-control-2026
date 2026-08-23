import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { RITTLER } from '@/components/sprint/sprintConfig';

const ZEILEN = [
  ['ami 2,5', 'zweieinhalb Stunden auf das Projekt mit dem Kürzel ami'],
  ['ami 90min', 'neunzig Minuten'],
  ['ami 14:45-16:15', 'festes Zeitfenster'],
  ['ami 1,5 Wireframes', 'alles nach dem Projekt und der Zeit wird zur Notiz'],
];

// Standardmäßig eingeklappt — die Zeile soll ohne Anleitung funktionieren.
export default function SchreibweiseHilfe() {
  const [offen, setOffen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOffen((o) => !o)}
        className="flex items-center gap-1 text-xs"
        style={{ color: RITTLER.textSecondary }}
      >
        {offen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        Wie schreibe ich das?
      </button>
      {offen && (
        <div className="mt-1.5 space-y-1">
          {ZEILEN.map(([bsp, text]) => (
            <p key={bsp} className="text-xs" style={{ color: RITTLER.textSecondary }}>
              <span className="font-semibold" style={{ color: RITTLER.black }}>{bsp}</span> — {text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}