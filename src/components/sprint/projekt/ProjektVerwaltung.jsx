import React from 'react';
import { ListChecks, Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { projectTypeOf } from '@/components/sprint/projectTypes';
import ProjektBearbeitenKnopf from '@/components/sprint/projekt/ProjektBearbeitenKnopf';
import CockpitLeiste from '@/components/projekt/CockpitLeiste';

// Verwaltungsfunktionen oben rechts im Projektkopf — getrennt von der täglichen Arbeit:
// Projekt bearbeiten (Admin), darunter in einer Zeile Projekt-Cockpit (Finanzrecht)
// und Aufgaben bereinigen (nur Führungskräfte).
export default function ProjektVerwaltung({ project, client, istAdmin, darfCockpit, darfAufraeumen, onBereinigen, onSaved }) {
  const navigate = useNavigate();
  if (!istAdmin && !darfCockpit && !darfAufraeumen) return null;
  // Folgephase: öffnet den Anlage-Assistenten mit diesem Projekt als Folgesprint vorbelegt
  const darfFolgephase = (istAdmin || darfAufraeumen) && project?.status !== 'abgeschlossen' && projectTypeOf(project) === 'sprint';
  const folgephase = () => navigate('/sprint/neu', {
    state: {
      seed: {
        client_id: project.client_id,
        type: 'sprint',
        pm_email: project.pm_email || '',
        title: project.title,
        sprint_target: 'folge',
        existing_project_id: project.id,
      },
    },
  });
  return (
    <div className="flex flex-col items-end gap-2">
      {istAdmin && <ProjektBearbeitenKnopf project={project} onSaved={onSaved} />}
      {darfFolgephase && (
        <button
          type="button"
          onClick={folgephase}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#555555] hover:text-foreground hover:underline"
        >
          <Layers className="w-3.5 h-3.5" /> Folgephase anlegen
        </button>
      )}
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
