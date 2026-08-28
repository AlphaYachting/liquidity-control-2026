import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Kopfleiste from './Kopfleiste';
import TimerKnopf from '@/components/sprint/timer/TimerKnopf';
import { ZeitKontextProvider } from '@/lib/sprint/ZeitKontext';

export default function AppLayout() {
  return (
    <ZeitKontextProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-auto bg-background">
          <Kopfleiste />
          {/* Freiraum unten in Höhe der Pille, damit sie keine Bedienelemente verdeckt */}
          <div className="p-4 md:p-6 lg:p-8 pb-28 md:pb-28 lg:pb-28 max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </main>
        <TimerKnopf />
      </div>
    </ZeitKontextProvider>
  );
}