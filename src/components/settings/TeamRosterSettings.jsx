import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import TeamRosterRow from './TeamRosterRow';

// Personenverwaltung: aktive Mannschaft, Fachrollen und eigene Farbe
export default function TeamRosterSettings() {
  const { toast } = useToast();
  const { data: members = [], isLoading, refetch } = useQuery({
    queryKey: ['team-roster'],
    queryFn: () => base44.entities.TeamMember.list('name', 200),
  });

  const save = async (draft) => {
    const { id, ...payload } = draft;
    await base44.entities.TeamMember.update(id, payload);
    await refetch();
    toast({ title: 'Person gespeichert', description: draft.name });
  };

  const setActive = async (member, active) => {
    await base44.entities.TeamMember.update(member.id, { active });
    await refetch();
  };

  if (isLoading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-8"><Loader2 className="w-4 h-4 animate-spin" /> Personen werden geladen...</div>;
  }

  const active = members.filter((m) => m.active !== false);
  const inactive = members.filter((m) => m.active === false);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personen im Betrieb</CardTitle>
          <p className="text-xs text-muted-foreground">
            Systemrolle steuert den Zugriff, Fachrollen steuern die Ticketzuweisung. Die Farbe erscheint
            im Kürzel-Chip, damit jede Person ihre Zuständigkeit auf einen Blick erkennt.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {active.map((m) => (
            <div key={m.id} className="space-y-1">
              <TeamRosterRow member={m} onSave={save} />
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setActive(m, false)}>
                  Deaktivieren
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {inactive.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Ehemalige</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {inactive.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg border px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.email}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setActive(m, true)}>Wieder aktivieren</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}