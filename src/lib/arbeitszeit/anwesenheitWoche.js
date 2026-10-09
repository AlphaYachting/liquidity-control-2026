import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { werteTagAus } from '../../../base44/shared/arbeitszeitKern.js';

// Anwesenheit (Kommen, Pause, Gehen) einer Woche für „Meine Zeiten“ — nur im neuen Modus geladen.
// Die Stempel liest jede Person selbst (RLS: nur eigene); die Anträge kommen über die Funktion
// zeitantrag (eigene Anträge und Klärfälle, für den Genehmiger zusätzlich alle offenen).
// Gerechnet wird mit demselben Kern wie auf dem Server (base44/shared/arbeitszeitKern.js).
export const ANWESENHEIT_WOCHE_KEY = ['anwesenheitWoche'];

export function useAnwesenheitWoche(email, tage, aktiv) {
  const mail = String(email || '').toLowerCase();
  return useQuery({
    queryKey: [...ANWESENHEIT_WOCHE_KEY, mail, tage[0]],
    enabled: !!aktiv && !!mail,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    placeholderData: (vorher) => vorher,
    queryFn: async () => {
      const [stempel, antraege] = await Promise.all([
        base44.entities.Stempel.filter({ person_email: mail, tag: { $gte: tage[0], $lte: tage[tage.length - 1] } }, 'zeit', 500).catch(() => []),
        base44.functions.invoke('zeitantrag', { aktion: 'liste' }).then((r) => r?.data || null).catch(() => null),
      ]);
      return { stempel, antraege: antraege || { eigene: [], genehmiger: false } };
    },
  });
}

// Anwesenheit eines Tages oder null, wenn an diesem Tag nicht gestempelt wurde
export function anwesenheitTag(stempel = [], tag, jetztIso) {
  const st = stempel.filter((s) => s.tag === tag);
  if (!st.length) return null;
  return { ...werteTagAus({ tag, stempel: st, buchungen: [], jetztIso, stempelt: true }), stempel: st };
}
