import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { RITTLER } from '@/components/sprint/sprintConfig';

const fmt = (v) => new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(v || 0);

// Nur die Bilanz des Tages — gebucht wird ausschließlich über den Timer-Knopf.
export default function HeuteGebucht({ entries = [], projectTitleById = {} }) {
  const [offen, setOffen] = useState(false);
  const summe = entries.reduce((s, e) => s + (e.hours || 0), 0);

  return (
    <div className="bg-white rounded-lg shadow-sm p-5">
      <button
        type="button"
        onClick={() => setOffen((o) => !o)}
        className="flex items-center gap-2 w-full text-left"
        disabled={entries.length === 0}
      >
        {entries.length > 0 && (offen
          ? <ChevronDown className="w-4 h-4" style={{ color: RITTLER.textSecondary }} />
          : <ChevronRight className="w-4 h-4" style={{ color: RITTLER.textSecondary }} />)}
        <span className="text-sm font-bold" style={{ color: RITTLER.black }}>
          Heute gebucht: {fmt(summe)} h
        </span>
        {entries.length > 0 && (
          <span className="text-xs" style={{ color: RITTLER.textSecondary }}>
            {entries.length} {entries.length === 1 ? 'Buchung' : 'Buchungen'}
          </span>
        )}
      </button>

      {offen && entries.length > 0 && (
        <div className="mt-3 space-y-1">
          {entries.map((e) => (
            <div key={e.id} className="flex items-baseline gap-2 text-[13px]">
              <span className="font-medium" style={{ color: RITTLER.black }}>
                {projectTitleById[e.project_id] || 'Projekt'}
              </span>
              <span style={{ color: RITTLER.textSecondary }}>{fmt(e.hours)} h</span>
              {e.note && <span className="truncate" style={{ color: RITTLER.textSecondary }}>· {e.note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}