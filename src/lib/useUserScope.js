import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-zäöüß]/g, '');

// Zuständigkeits-Kontext des angemeldeten Nutzers:
// Welche Projekte/Kunden gehören ihm — und darf er alles sehen?
export function useUserScope() {
  const { user } = useAuth();
  const email = user?.email;

  const { data: profile, isLoading } = useQuery({
    queryKey: ['team-profile', email],
    queryFn: async () => {
      const rows = await base44.entities.TeamMemberProfile.filter({ user_email: email }, '-created_date', 1);
      return rows[0] || null;
    },
    enabled: !!email,
    staleTime: 5 * 60 * 1000,
  });

  // Ohne gepflegtes Profil: Admins sehen alles, alle anderen nur ihre eigenen
  // Projekte (Abgleich über den vollen Namen des Kontos).
  const seesAll = profile ? profile.data_scope === 'all' : user?.role === 'admin';
  const aliases = profile?.pm_aliases?.length ? profile.pm_aliases : [user?.full_name].filter(Boolean);
  const workAreas = profile?.work_areas?.length
    ? profile.work_areas
    : (user?.role === 'admin' ? ['projects', 'sales', 'backoffice', 'management'] : ['projects']);

  const normalizedAliases = aliases.map(norm).filter((a) => a.length >= 3);

  // Ist diese Person als Verantwortliche/r eingetragen? Toleriert Kurzformen
  // ("A. Rittler" vs. "Alfons Rittler") über Teilstring-Vergleich.
  const isMine = (responsible) => {
    const v = norm(responsible);
    if (!v) return false;
    return normalizedAliases.some((a) => v.includes(a) || a.includes(v));
  };

  return {
    isLoading,
    profile,
    seesAll,
    aliases,
    workAreas,
    hasArea: (area) => seesAll || workAreas.includes(area),
    // seesAll => alles durchlassen, sonst nur eigene Zuständigkeiten
    isMine: (responsible) => seesAll || isMine(responsible),
    isMineStrict: isMine,
  };
}