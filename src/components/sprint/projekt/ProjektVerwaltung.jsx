import React from 'react';
import { ListChecks } from 'lucide-react';
import ProjektBearbeitenKnopf from '@/components/sprint/projekt/ProjektBearbeitenKnopf';
import CockpitLeiste from '@/components/projekt/CockpitLeiste';

// Verwaltungsfunktionen oben rechts im Projektkopf — getrennt von der täglichen Arbeit:
// Projekt bearbeiten (Admin), darunter in einer Zeile Projekt-Cockpit (Finanzrecht)
// und Aufgaben bereinigen (nur Führungskräfte).
export default function ProjektVerwaltung({ project, client, istAdmin, darfCockpit, darfAufraeumen, onBereinigen, onSaved }) {
  if (!istAdmin && !darfCockpit && !darfAufraeumen) return null;
  return (
    <div className="flex flex-col items-end gap-2">
      {istAdmin && <ProjektBearbeitenKnopf project={project} onSaved={onSaved} />}
      <div className="flex flex-wrap justify-end items-center gap-x-3.5 gap-y-1">
        <CockpitLeiste project={project} client={client} istAdmin={istAdmin} darfSehen={darfCockpit} onSaved={onSaved} />
        {darfAufraeumen && (
          <button
            type="button"
            onClick={onBereinigen}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#555555] hover:text-foreground hover:underline"
          >
            <ListChecks className="w-3.5 h-3.5" /> Aufgaben bereinigen
          </button>
        )}
      </div>
    </div>
  );
}
