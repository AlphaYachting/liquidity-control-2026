import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { zuweisen } from '@/lib/crm/zuweisung';
import { INHABER_EMAIL } from '@/lib/crm/vertraulich';

export const TEAM_KEY = ['team-members-active'];

export function useTeam() {
  return useQuery({
    queryKey: TEAM_KEY,
    queryFn: () => base44.entities.TeamMember.filter({ active: true }, 'name', 100),
    staleTime: 10 * 60 * 1000,
  });
}

export function nameVon(email, team = []) {
  if (!email) return '';
  const m = team.find((t) => (t.email || '').toLowerCase() === email.toLowerCase());
  return m?.name || email.split('@')[0];
}

// Kurzanzeige in der Zeile: „→ Carina“ (automatisch zugewiesen mit Hinweis)
export function ZustaendigHinweis({ eintrag }) {
  const { data: team = [] } = useTeam();
  if (!eintrag?.zustaendig) return <span className="text-meta text-muted-foreground">nicht zugewiesen</span>;
  return (
    <span className="text-meta font-semibold text-foreground" title={eintrag.zuweisung?.quelle === 'automatisch' ? 'automatisch zugewiesen (ein Arbeitstag ohne Reaktion)' : undefined}>
      → {nameVon(eintrag.zustaendig, team)}{eintrag.zuweisung?.quelle === 'automatisch' ? ' (auto)' : ''}
    </span>
  );
}

// Auswahl der zuständigen Person — die Mail erscheint in „Mein Tag“ dieser Person, bis sie beantwortet ist.
export default function ZuweisungWahl({ eintrag, onChanged }) {
  const { data: team = [] } = useTeam();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const aktuell = eintrag?.zustaendig || '';
  const ich = user?.email || '';
  // Vertrauliche Post (Verwaltung, nur an den GF) sieht nur der Geschäftsführer — eine Zuweisung an
  // Kollegen würde bei ihnen nicht erscheinen. Bis zu einer Freigabe nur an den GF zuweisbar.
  const auswahl = eintrag?.vertraulich
    ? team.filter((m) => (m.email || '').toLowerCase() === INHABER_EMAIL)
    : team;
  const darfMir = ich && (!eintrag?.vertraulich || ich.toLowerCase() === INHABER_EMAIL);

  const setzen = async (an) => {
    setBusy(true);
    try {
      await zuweisen({ eintrag, an, vorhandene: eintrag.zuweisung || null });
      toast({ title: an ? `Zugewiesen an ${nameVon(an, team)} — erscheint in „Mein Tag“` : 'Zuweisung aufgehoben' });
      queryClient.invalidateQueries({ queryKey: ['posteingang'] });
      queryClient.invalidateQueries({ queryKey: ['crm-escalations'] });
      queryClient.invalidateQueries({ queryKey: ['eskalations-liste'] });
      onChanged?.();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Nicht gespeichert', description: e?.message });
    }
    setBusy(false);
  };

  const hinweis = [
    eintrag?.vertraulich ? 'vertraulich — nur an dich zuweisbar' : '',
    eintrag?.zuweisung?.quelle === 'automatisch' ? 'automatisch zugewiesen — ein Arbeitstag ohne Reaktion' : '',
  ].filter(Boolean).join(' · ');

  // Einheitlich am rechten Rand der Aktionsleiste: Auswahl + „Mir“, Hinweise als Tooltip
  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()} title={hinweis || undefined}>
      <span className="text-label uppercase text-muted-foreground">Zuständig</span>
      <Select value={aktuell || '__none__'} onValueChange={(v) => setzen(v === '__none__' ? '' : v)} disabled={busy}>
        <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Zuweisen" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Nicht zugewiesen</SelectItem>
          {auswahl.map((m) => <SelectItem key={m.id} value={m.email}>{m.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {darfMir && aktuell.toLowerCase() !== ich.toLowerCase() && (
        <Button size="sm" variant="ghost" className="h-8 text-xs px-2" disabled={busy} onClick={() => setzen(ich)} title="Mir zuweisen">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />} Mir
        </Button>
      )}
    </div>
  );
}
