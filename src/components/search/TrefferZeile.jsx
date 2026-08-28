import React from 'react';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import TypenSchild from './TypenSchild';
import KundenKarte from './KundenKarte';
import Hervorhebung from './Hervorhebung';

// Auswahl = weicher Markenton mit Balken links. Grau bedeutet hier nichts.
export default function TrefferZeile({ zeile, eingabe, markiert, onWaehlen, onZeigen }) {
  return (
    <button
      type="button"
      onMouseEnter={onZeigen}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onWaehlen}
      className="w-full text-left flex items-start gap-2.5"
      style={{
        padding: '8px 14px',
        borderLeft: `2.5px solid ${markiert ? RITTLER.pink : 'transparent'}`,
        backgroundColor: markiert ? 'hsl(var(--primary) / 0.06)' : 'transparent',
      }}
    >
      <span className="pt-0.5"><TypenSchild typ={zeile.entry_type} /></span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13.5px] font-semibold truncate" style={{ color: RITTLER.black }}>
          <Hervorhebung text={zeile.title} eingabe={eingabe} />
        </span>
        {zeile.subtitle && (
          <span className="block text-[12px] truncate" style={{ color: RITTLER.textSecondary }}>
            {zeile.subtitle}
          </span>
        )}
        {zeile.entry_type === 'kunde' && <KundenKarte card={zeile.card} />}
      </span>
      {(zeile.side || zeile.side_note) && (
        <span className="hidden sm:block text-right shrink-0 tabular-nums">
          {zeile.side && (
            <span
              className="block text-[12.5px] font-semibold"
              style={{ color: zeile.is_due ? STATUS_COLORS.critical : RITTLER.black }}
            >
              {zeile.side}
            </span>
          )}
          {zeile.side_note && (
            <span className="block text-[11px]" style={{ color: zeile.is_due ? STATUS_COLORS.critical : RITTLER.textSecondary }}>
              {zeile.side_note}
            </span>
          )}
        </span>
      )}
    </button>
  );
}