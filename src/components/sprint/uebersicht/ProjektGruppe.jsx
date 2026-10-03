import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';

// Ein Abschnitt der Projektliste (ein Projekttyp): Kopf mit Typfarbe, Anzahl und Zahl der
// Projekte mit Handlungsbedarf — einklappbar, damit große Gruppen die Liste nicht zudecken.
export default function ProjektGruppe({ gruppe, anzahl, dringend = 0, offen, onToggle, children }) {
  const Pfeil = offen ? ChevronDown : ChevronRight;

  return (
    <div className="bg-white rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={offen}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-[#fafafa]"
        style={{ borderBottom: offen ? `1px solid ${RITTLER.line}` : undefined }}
      >
        <Pfeil className="w-4 h-4 shrink-0" style={{ color: RITTLER.textSecondary }} />
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: gruppe.style.pillText }} />
        <span className="text-[13px] font-bold uppercase tracking-[1px]" style={{ color: RITTLER.black }}>
          {gruppe.titel}
        </span>
        <span
          className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
          style={{ backgroundColor: gruppe.style.pillBg, color: gruppe.style.pillText }}
        >
          {anzahl}
        </span>
        {dringend > 0 && (
          <span className="ml-auto text-[12px] font-semibold" style={{ color: STATUS_COLORS.critical }}>
            {dringend} mit Handlungsbedarf
          </span>
        )}
      </button>
      {offen && <div>{children}</div>}
    </div>
  );
}
