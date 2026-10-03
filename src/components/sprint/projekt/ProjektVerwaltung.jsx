import React from 'react';
import { ListChecks } from 'lucide-react';
import ProjektBearbeitenKnopf from '@/components/sprint/projekt/ProjektBearbeitenKnopf';
import CockpitLeiste from '@/components/projekt/CockpitLeiste';

// Verwaltungsfunktionen oben rechts im Projektkopf — getrennt von der täglichen Arbeit:
// Projekt bearbeiten (Admin), Projekt-Cockpit (Finanzrecht), Aufgaben bereinigen (Admin und Projektverantwortliche).
export default function ProjektVerwaltung({ project, client, istAdmin, darfCockpit, darfAufraeumen, onBereinigen, onSaved }) {
  if (!istAdmin && !darfCockpit && !darfAufraeumen) return null;
  return (
    <div className="flex flex-col items-end gap-1">
      {istAdmin && <ProjektBearbeitenKnopf project={project} onSaved={onSaved} />}
      <CockpitLeiste project={project} client={client} istAdmin={istAdmin} darfSehen={darfCockpit} onSaved={onSaved} />
      {darfAufraeumen && (
        <button
          type="button"
          onClick={onBereinigen}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          <ListChecks className="w-3.5 h-3.5" /> Aufgaben bereinigen
        </button>
      )}
    </div>
  );
}
