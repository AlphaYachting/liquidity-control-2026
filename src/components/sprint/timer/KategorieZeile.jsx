import React from 'react';
import { KATEGORIE_TEXT } from '@/lib/sprint/buchungsfelder';
import { RITTLER } from '@/components/sprint/sprintConfig';

// Reine Anzeige — die Kategorie folgt dem Abrechnungsmodell des Projekts, sie ist nicht wählbar.
export default function KategorieZeile({ kategorie }) {
  if (!kategorie) return null;
  return (
    <p className="text-[13px]" style={{ color: RITTLER.textSecondary }}>
      {KATEGORIE_TEXT[kategorie] || kategorie}
    </p>
  );
}