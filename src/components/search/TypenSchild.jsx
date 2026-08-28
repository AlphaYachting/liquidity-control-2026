import React from 'react';
import { RITTLER } from '@/components/sprint/sprintConfig';

const KURZ = {
  kunde: 'Kunde', projekt: 'Projekt', auftrag: 'Auftrag', angebot: 'Angebot',
  vertrag: 'Vertrag', rechnung: 'Beleg', anweisung: 'Anweis.', sprint: 'Sprint',
  ticket: 'Ticket', zeit: 'Zeit', akte: 'Akte', seite: 'Seite',
};

export default function TypenSchild({ typ }) {
  return (
    <span
      className="text-[9px] font-bold uppercase shrink-0 text-left"
      style={{ color: RITTLER.textSecondary, minWidth: 38, letterSpacing: '0.6px' }}
    >
      {KURZ[typ] || typ}
    </span>
  );
}