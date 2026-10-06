import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const MONATE = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

// Kategorie und Budgetzeile eines Projekts — die Summen kommen fertig aus dem Backend.
export function useProjektKontext(projectId) {
  return useQuery(projektKontextQuery(projectId));
}

// Vorladen, sobald jemand im Projekt ist — das Zeitfenster öffnet dann ohne Wartezeit.
export function usePrefetchProjektKontext(projectId) {
  const qc = useQueryClient();
  useEffect(() => {
    if (projectId) qc.prefetchQuery(projektKontextQuery(projectId));
  }, [projectId, qc]);
}

function projektKontextQuery(projectId) {
  return {
    queryKey: ['projektKontext', projectId],
    enabled: !!projectId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const [project, summenAntwort] = await Promise.all([
        base44.entities.Project.get(projectId),
        base44.functions.invoke('projektZeitSummen', { project_id: projectId }),
      ]);
      const summen = summenAntwort?.data || {};
      const kategorie = project.abrechnungsmodell || 'sprint';
      // Der Kundenname gehört zum Kopf jeder Erfassung — er wird hier mitgeladen.
      const client = project.client_id
        ? await base44.entities.Client.get(project.client_id).catch(() => null)
        : null;

      let budget = null;
      let kategorieText = null;
      if (project.is_legacy) {
        // Pauschalprojekt (früher Altprojekt): dieselbe Rechnung wie im Projektkopf — aWork-Stand bis zur
        // Umstellung plus alle Buchungen in der App gegen die Budgetstunden; dazu die Auftragssumme.
        // Gilt unabhängig vom gespeicherten Abrechnungsmodell. Der Behälter-Sprint hat kein Budget.
        budget = {
          label: 'Budget gesamt',
          gebucht: (Number(project.awork_altstand_stunden) || 0) + (Number(summen.gebucht_gesamt) || 0),
          gesamt: Number(project.target_hours) || 0,
          betrag: Number(project.total_budget) || 0,
          pauschal: true,
        };
        kategorieText = 'Pauschalprojekt · zählt gegen das Budget';
      } else if (kategorie === 'sprint' && summen.sprint_id) {
        budget = {
          label: `Sprint ${summen.sprint_titel || 'laufend'}`,
          gebucht: summen.gebucht_sprint || 0,
          gesamt: summen.sprint_target_hours || 0,
        };
      } else if (kategorie === 'support') {
        budget = {
          label: `Kontingent ${MONATE[new Date().getMonth()]}`,
          gebucht: summen.gebucht_monat || 0,
          gesamt: project.support_kontingent_stunden || 0,
        };
      } else if (kategorie === 'paket') {
        // Container/Retainer: Monatsstunden gegen ein optionales Monatskontingent
        budget = {
          label: `Kontingent ${MONATE[new Date().getMonth()]}`,
          gebucht: summen.gebucht_monat || 0,
          gesamt: project.support_kontingent_stunden || 0,
        };
      } else if (kategorie === 'aufwand') {
        budget = { label: 'Bisher gebucht', gebucht: summen.gebucht_gesamt || 0, gesamt: 0 };
      }

      return { project, client, kategorie, kategorieText, budget, summen };
    },
  };
}