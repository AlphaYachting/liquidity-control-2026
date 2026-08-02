import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TimerKnopf from '@/components/sprint/timer/TimerKnopf';

export default function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
          <Outlet />
        </div>
      </main>
      <TimerKnopf />
    </div>
  );
}