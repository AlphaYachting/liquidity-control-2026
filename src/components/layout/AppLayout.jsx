import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Kopfleiste from './Kopfleiste';
import TimerKnopf from '@/components/sprint/timer/TimerKnopf';
import { ZeitKontextProvider } from '@/lib/sprint/ZeitKontext';
import { ladeAlltagsseitenVor } from '@/lib/seitenVorladen';
import { useErsterAufruf } from '@/lib/zeit/useErsterAufruf';

// Schmaler Ladebalken statt Text — erscheint nur noch beim allerersten Laden,
// danach bleibt beim Seitenwechsel die bisherige Seite stehen (Router-Übergang).
function Ladebalken() {
  return (
    <div className="h-0.5 w-full overflow-hidden rounded bg-muted" role="progressbar" aria-label="Ansicht wird geladen">
      <div className="h-full w-1/3 bg-primary animate-pulse" />
    </div>
  );
}

export default function AppLayout() {
  useEffect(() => { ladeAlltagsseitenVor(); }, []);
  useErsterAufruf();

  return (
    <ZeitKontextProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-auto bg-canvas">
          <Kopfleiste />
          {/* Freiraum unten in Höhe der Pille, damit sie keine Bedienelemente verdeckt */}
          <div className="p-4 md:p-6 lg:p-8 pb-28 md:pb-28 lg:pb-28 max-w-[1600px] mx-auto">
            <React.Suspense fallback={<Ladebalken />}>
              <Outlet />
            </React.Suspense>
          </div>
        </main>
        <TimerKnopf />
      </div>
    </ZeitKontextProvider>
  );
}