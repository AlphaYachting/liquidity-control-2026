import React from 'react';
import { Pencil } from 'lucide-react';
import Ampelpunkt from '@/components/sprint/Ampelpunkt';
import TypPill from '@/components/sprint/TypPill';
import { RITTLER } from '@/components/sprint/sprintConfig';

// Projekt ohne aktiven Sprint/Behälter — gleiches Raster wie ProjektZeile, sprintabhängige Spalten leer.
export default function ProjektZeileOhneSprint({ project, client, onEdit }) {
  return (
    <div className="border-b border-[#eeeeee] last:border-0" style={{ borderLeft: '3px solid transparent' }}>
      <div className="flex items-center gap-3 px-4 py-3">
        <Ampelpunkt status="plan" />
        <TypPill project={project} />

        <div className="flex-1 min-w-0">
          <p className="text-[17px] font-medium truncate" style={{ color: RITTLER.black }}>
            {project?.title || 'Projekt'}
          </p>
          <p className="text-[12px] uppercase tracking-[0.5px] truncate" style={{ color: RITTLER.textSecondary }}>
            {client?.name || 'Kunde'} · PM: {project?.pm_email || '—'}
          </p>
        </div>

        <div className="hidden md:block w-[72px] shrink-0" />
        <div className="hidden sm:block w-[110px] shrink-0" />

        <div className="w-[160px] shrink-0 text-right">
          <p className="text-[13px]" style={{ color: RITTLER.textSecondary }}>
            kein aktiver Sprint/Behälter
          </p>
        </div>

        <div className="hidden lg:block w-[150px] shrink-0" />

        {onEdit && (
          <button
            type="button"
            title="Stammdaten bearbeiten"
            onClick={() => onEdit()}
            className="shrink-0 h-8 w-8 flex items-center justify-center rounded hover:bg-muted"
          >
            <Pencil className="w-3.5 h-3.5" style={{ color: RITTLER.textSecondary }} />
          </button>
        )}
      </div>
    </div>
  );
}