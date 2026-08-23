import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { base44 } from '@/api/base44Client';

// Durchsucht Kürzel, Projekttitel und Kundenname über ALLE Projekte — eine
// Zuweisung ist keine Voraussetzung. Zuletzt bebuchte Projekte stehen oben.
const vor14Tagen = () => {
  const d = new Date();
  d.setDate(d.getDate() - 14);
  return d.toISOString().slice(0, 10);
};

export const kuerzelVorschlag = (name = '') =>
  (name.replace(/[^A-Za-zÄÖÜäöüß]/g, '').slice(0, 3) || 'PRJ').toLowerCase();

const treffertyp = (feld, wort) => {
  const f = (feld || '').toLowerCase();
  if (!f) return 0;
  if (f === wort) return 100;
  if (f.split(/[\s\-_/]+/).some((w) => w.startsWith(wort))) return 60;
  if (f.includes(wort)) return 25;
  return 0;
};

export function useProjektSuche(email) {
  const { data } = useQuery({
    queryKey: ['zeitProjektSuche', email],
    enabled: !!email,
    queryFn: async () => {
      const [projects, clients, eigene] = await Promise.all([
        base44.entities.Project.list('title', 500),
        base44.entities.Client.list('name', 500),
        base44.entities.TimeEntry.filter({ person_email: email }, '-entry_date', 400),
      ]);
      const clientById = Object.fromEntries(clients.map((c) => [c.id, c]));
      const grenze = vor14Tagen();
      const haeufigkeit = {};
      eigene.filter((e) => (e.entry_date || '') >= grenze)
        .forEach((e) => { haeufigkeit[e.project_id] = (haeufigkeit[e.project_id] || 0) + 1; });

      const eintraege = projects
        .filter((p) => p.status !== 'abgeschlossen')
        .map((p) => ({
          ...p,
          clientName: clientById[p.client_id]?.name || '',
          kuerzelAnzeige: p.kuerzel || kuerzelVorschlag(clientById[p.client_id]?.name || p.title),
          zuletzt: haeufigkeit[p.id] || 0,
        }));
      return { eintraege, clients };
    },
  });

  const suche = useCallback((wortRoh) => {
    const eintraege = data?.eintraege || [];
    const wort = (wortRoh || '').trim().toLowerCase();

    if (!wort) {
      return eintraege.filter((p) => p.zuletzt > 0).sort((a, b) => b.zuletzt - a.zuletzt).slice(0, 4);
    }

    return eintraege
      .map((p) => {
        const score = Math.max(
          treffertyp(p.kuerzel || p.kuerzelAnzeige, wort) + 10,
          treffertyp(p.title, wort),
          treffertyp(p.clientName, wort),
        );
        return { ...p, score: score + Math.min(p.zuletzt, 5) * 5 };
      })
      .filter((p) => p.score > 10)
      .sort((a, b) => b.score - a.score || (a.title || '').localeCompare(b.title || ''))
      .slice(0, 4);
  }, [data]);

  return { suche, clients: data?.clients || [], geladen: !!data };
}