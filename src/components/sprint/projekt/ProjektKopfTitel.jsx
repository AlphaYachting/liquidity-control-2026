import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import TypPill from '@/components/sprint/TypPill';
import ProjektleitungWahl from '@/components/sprint/projekt/ProjektleitungWahl';

// Titelblock des Projektkopfs: Typ, Projektname, Kunde mit Eckdaten, verantwortliche Person.
// Die verantwortliche Person lässt sich per Klick direkt aus dem Team wählen.
export default function ProjektKopfTitel({ project, unterzeile, personRolle = 'Projektleitung' }) {
  return (
    <div className="flex items-start gap-3 min-w-0 flex-[1_1_520px]">
      <Link
        to="/sprint/projekte"
        aria-label="Zurück zu den Projekten"
        className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="w-[18px] h-[18px]" />
      </Link>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <TypPill project={project} />
          <h1 className="m-0 text-[26px] leading-8 font-bold tracking-[-0.015em] text-foreground">
            {project?.title || 'Projekt'}
          </h1>
        </div>
        {unterzeile && <p className="m-0 text-sm text-[#555555]">{unterzeile}</p>}
        {project && <ProjektleitungWahl project={project} rolle={personRolle} />}
      </div>
    </div>
  );
}
