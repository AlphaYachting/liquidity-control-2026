import { base44 } from '@/api/base44Client';
import { queryClientInstance } from '@/lib/query-client';

// Gemeinsame Abrufe der Zeiterfassung: mehrere Bausteine teilen sich EINE Anfrage.
// Stammdaten ändern sich selten (5 Minuten Zwischenspeicher), eigene Buchungen
// werden nur gleichzeitig laufende Anfragen zusammengelegt.
export const ladeStammdaten = () => queryClientInstance.fetchQuery({
  queryKey: ['zeitStammdaten'],
  staleTime: 5 * 60 * 1000,
  queryFn: async () => {
    const [projects, clients] = await Promise.all([
      base44.entities.Project.list('title', 500),
      base44.entities.Client.list('name', 500),
    ]);
    return { projects, clients };
  },
});

export const ladeEigeneBuchungen = (email) => queryClientInstance.fetchQuery({
  queryKey: ['zeitEigeneBuchungen', email],
  staleTime: 2000,
  queryFn: () => base44.entities.TimeEntry.filter({ person_email: email }, '-entry_date', 500),
});

export const ladeEigeneAbschluesse = (email) => queryClientInstance.fetchQuery({
  queryKey: ['zeitEigeneAbschluesse', email],
  staleTime: 2000,
  queryFn: () => base44.entities.Tagesabschluss.filter({ person_email: email }, '-tag', 60),
});

export const ladeEigeneAbwesenheiten = (email) => queryClientInstance.fetchQuery({
  queryKey: ['zeitEigeneFocusDays', email],
  staleTime: 2000,
  queryFn: () => base44.entities.FocusDay.filter({ person_email: email }, '-day', 200),
});