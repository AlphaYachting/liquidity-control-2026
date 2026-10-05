import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { todayIso } from '@/components/sprint/sprintConfig';
import { ermittleOffeneTage, ladePflichtAb, PFLICHT_AB } from './offeneTage';
import { ladeEigeneBuchungen, ladeEigeneAbschluesse, ladeEigeneAbwesenheiten } from './zeitDaten';

// Stichtag — Stammdatum mit langem Zwischenspeicher.
export function usePflichtAb() {
  const { data } = useQuery({
    queryKey: ['pflichtAb'],
    queryFn: ladePflichtAb,
    staleTime: Infinity,
  });
  return data || PFLICHT_AB;
}

// Offene Tage der eigenen Person — Grundlage der Buchungssperre.
export function useOffeneTage(email) {
  const pflichtAb = usePflichtAb();
  const { data } = useQuery({
    queryKey: ['offeneTage', email, pflichtAb],
    enabled: !!email,
    queryFn: async () => {
      const [eintraege, abschluesse, focusDays] = await Promise.all([
        ladeEigeneBuchungen(email),
        ladeEigeneAbschluesse(email),
        ladeEigeneAbwesenheiten(email),
      ]);
      return ermittleOffeneTage({ heute: todayIso(), eintraege, abschluesse, focusDays, pflichtAb });
    },
  });

  const offeneTage = data || [];
  const aeltester = offeneTage[0] || null;

  // Grundsatz: Gesperrt wird, was noch nicht begonnen hat. Was läuft, muss immer
  // beendet werden können. Gesperrt ist daher nur eine Buchung, die NICHT in den
  // offenen Tag geht — sonst ließe sich der Tag nie schließen.
  const darfBuchen = (zielTag) => !aeltester || zielTag === aeltester.tag;

  return { offeneTage, aeltester, darfBuchen, gesperrt: offeneTage.length > 0, pflichtAb };
}