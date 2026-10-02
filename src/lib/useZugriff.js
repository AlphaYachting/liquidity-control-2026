import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

// Die EINE Zugriffsregel der App: Was darf die angemeldete Person sehen?
// Quellen: Konto-Rolle (admin), Personenliste (Stufe + Fachrollen) und
// Zuständigkeitsprofil (Aufgabenbereiche). Navigation, Startseite und später
// der Seitenzugriff lesen ausschließlich hier.
//
// Rechte:
//  alle     — jede angemeldete Person
//  leitung  — Projektleitung und Führung
//  fuehrung — Führung
//  geld     — Finanzrecht: Bereich Backoffice oder Führung (wie in der Suche)
//  sales    — Vertrieb: Führung oder Bereich Sales
//  support  — Support-Eingang: Führung oder Fachrolle Web
//  admin    — Administrator

const ALLE_BEREICHE = ['projects', 'sales', 'backoffice', 'management'];

export const RECHT_LABEL = {
  alle: 'Alle',
  leitung: 'Projektleitung und Führung',
  fuehrung: 'Führung',
  geld: 'Finanzrecht (Backoffice, Führung)',
  sales: 'Sales und Führung',
  support: 'Webentwicklung und Führung',
  admin: 'Admin',
};

export function useZugriff() {
  const { user } = useAuth();
  const email = user?.email;
  const istAdmin = user?.role === 'admin';

  // Derselbe Schlüssel wie in useUserScope — das Profil wird nur einmal geladen.
  const { data: profile, isLoading: ladeProfil } = useQuery({
    queryKey: ['team-profile', email],
    queryFn: async () => {
      const rows = await base44.entities.TeamMemberProfile.filter({ user_email: email }, '-created_date', 1);
      return rows[0] || null;
    },
    enabled: !!email,
    staleTime: 5 * 60 * 1000,
  });

  const { data: person, isLoading: ladePerson } = useQuery({
    queryKey: ['zugriff-person', email],
    queryFn: async () => {
      const rows = await base44.entities.TeamMember.filter({ email }, 'name', 1);
      const p = rows[0] || null;
      return p && p.active !== false ? p : null;
    },
    enabled: !!email,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = !!email && (ladeProfil || ladePerson);

  return useMemo(() => {
    // Ohne Eintrag in der Personenliste: Admin gilt als Führung, alle anderen als Produktion.
    const stufe = person?.system_role || (istAdmin ? 'gf' : 'teammitglied');
    const fachrollen = person?.roles || [];
    const fuehrung = istAdmin || stufe === 'gf';
    const bereiche = profile?.work_areas?.length
      ? profile.work_areas
      : (fuehrung ? ALLE_BEREICHE : ['projects']);

    const rechte = {
      alle: true,
      leitung: fuehrung || stufe === 'pm',
      fuehrung,
      geld: istAdmin || bereiche.includes('backoffice') || bereiche.includes('management'),
      sales: fuehrung || bereiche.includes('sales'),
      support: fuehrung || fachrollen.includes('Web'),
      admin: istAdmin,
    };

    // Solange Personenliste und Profil laden, gilt nur "alle" — nie kurz zu viel zeigen.
    // Der Admin steht sofort fest und muss nicht warten.
    const darf = (regel) => {
      if (istAdmin) return true;
      const liste = Array.isArray(regel) ? regel : [regel];
      if (isLoading) return liste.includes('alle');
      return liste.some((r) => !!rechte[r]);
    };

    return { isLoading: isLoading && !istAdmin, istAdmin, stufe, fachrollen, bereiche, rechte, darf };
  }, [person, profile, istAdmin, isLoading]);
}
