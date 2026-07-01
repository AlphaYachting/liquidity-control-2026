import React from 'react';
import { Outlet } from 'react-router-dom';
import { Scale } from 'lucide-react';
import RestructuringNav from './RestructuringNav';
import { fmtDate } from '@/lib/restructuring/restructuringFormat';

export default function RestructuringLayout() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="p-2.5 rounded-xl bg-slate-800">
            <Scale className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Sanierungs-Reporting</h1>
            <p className="text-xs text-muted-foreground">
              Quellennachvollziehbare Finanzauswertungen · Stand {fmtDate(new Date())} · Kein Ersatz für Gerichtsdokumente
            </p>
          </div>
        </div>
      </div>
      <RestructuringNav />
      <div className="p-4 max-w-[1400px] mx-auto">
        <Outlet />
      </div>
    </div>
  );
}