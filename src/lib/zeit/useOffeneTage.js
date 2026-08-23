import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { todayIso } from '@/components/sprint/sprintConfig';
import { ermittleOffeneTage } from './offeneTage';

// Offene Tage der eigenen Person — Grundlage der Buchungssperre.
export function useOffeneTage(email) {
  const { data } = useQuery({
    queryKey: ['offeneTage', email],
    enabled: !!email,
    queryFn: async () => {
      const [eintraege, abschluesse, focusDays] = await Promise.all([
        base44.entities.TimeEntry.filter({ person_email: email }, '-entry_date', 500),
        base44.entities.Tagesabschluss.filter({ person_email: email }, '-tag', 60),
        base44.entities.FocusDay.filter({ person_email: email }, '-day', 200),
      ]);
      return ermittleOffeneTage({ heute: todayIso(), eintraege, abschluesse, focusDays });
    },
  });

  const offeneTage = data || [];
  return { offeneTage, aeltester: offeneTage[0] || null, gesperrt: offeneTage.length > 0 };
}