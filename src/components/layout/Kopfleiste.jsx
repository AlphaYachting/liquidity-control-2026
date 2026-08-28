import React from 'react';
import { RITTLER } from '@/components/sprint/sprintConfig';
import GlobalSearch from '@/components/search/GlobalSearch';

// Auf dem Handy rutscht das Feld in eine eigene Zeile unter die Kopfleiste.
export default function Kopfleiste() {
  return (
    <header
      className="sticky top-0 z-30 bg-background border-b"
      style={{ borderColor: RITTLER.line }}
    >
      <div className="max-w-[1600px] mx-auto px-4 md:px-6 lg:px-8 py-2 flex justify-center pl-14 md:pl-6">
        <GlobalSearch />
      </div>
    </header>
  );
}