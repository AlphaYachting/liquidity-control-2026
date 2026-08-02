import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { laufenderSprint } from './buchungsfelder';

const MONATE = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

// Kategorie und Budgetzeile eines Projekts — reine Anzeige, blockiert nie eine Buchung.
export function useProjektKontext(projectId) {
  return useQuery({
    queryKey: ['projektKontext', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const [project, sprints, entries] = await Promise.all([
        base44.entities.Project.get(projectId),
        base44.entities.Sprint.filter({ project_id: projectId }, 'delivery_date', 50),
        base44.entities.TimeEntry.filter({ project_id: projectId }, '-entry_date', 1000),
      ]);
      const kategorie = project.abrechnungsmodell || 'sprint';
      const sprint = laufenderSprint(sprints);
      const summe = (rows) => rows.reduce((s, e) => s + (e.hours || 0), 0);

      let budget = null;
      if (kategorie === 'sprint' && sprint) {
        const milestones = await base44.entities.Milestone.filter({ sprint_id: sprint.id }, 'order', 50);
        const aktiv = milestones.find((m) => m.state !== 'freigegeben');
        budget = {
          label: `Etappe ${aktiv?.title || sprint.title || 'laufend'}`,
          gebucht: summe(entries.filter((e) => e.sprint_id === sprint.id)),
          gesamt: sprint.target_hours || 0,
        };
      } else if (kategorie === 'support') {
        const now = new Date();
        const praefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        budget = {
          label: `Kontingent ${MONATE[now.getMonth()]}`,
          gebucht: summe(entries.filter((e) => (e.entry_date || '').startsWith(praefix))),
          gesamt: project.support_kontingent_stunden || 0,
        };
      } else if (kategorie === 'aufwand') {
        budget = { label: 'Bisher gebucht', gebucht: summe(entries), gesamt: 0 };
      }

      return { project, kategorie, budget };
    },
  });
}