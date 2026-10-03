import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { initials, personColor } from '@/components/sprint/PersonenChip';
import { useZugriff } from '@/lib/useZugriff';
import { schreibeSystemEintrag } from '@/lib/sprint/systemComment';
import { ladeAnsichtenNachTicketAenderung } from '@/lib/sprint/ansichtenNeuLaden';

// Aktive Teammitglieder für die Auswahl der Projektleitung — einmal geladen, überall geteilt.
export function useTeamMitglieder(enabled = true) {
  return useQuery({
    queryKey: ['teamMitglieder', 'aktiv'],
    queryFn: () => base44.entities.TeamMember.filter({ active: true }, 'name', 200),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

const Kreis = ({ person, size = 22 }) => (
  <span
    className="inline-flex shrink-0 items-center justify-center rounded-full text-[10px] font-bold uppercase text-white"
    style={{ width: size, height: size, backgroundColor: personColor(person) }}
  >
    {initials(person?.name || person?.email)}
  </span>
);

// Projektleitung im Kopf von Projekt- und Etappenseite. Ein Klick auf Kreis oder Namen
// öffnet die Teamliste — wie bei der Zuweisung einer Aufgabe. Ändern dürfen Führung,
// Projektleitungen und die aktuell eingetragene Person; alle anderen sehen nur die Anzeige.
export default function ProjektleitungWahl({ project, rolle = 'Projektleitung' }) {
  const queryClient = useQueryClient();
  const { darf } = useZugriff();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });
  const { data: mitglieder = [] } = useTeamMitglieder(!!project?.id);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');

  const pmEmail = (project?.pm_email || '').toLowerCase();
  const person = pmEmail
    ? mitglieder.find((m) => (m.email || '').toLowerCase() === pmEmail) || { email: project.pm_email, name: project.pm_email }
    : null;
  const istAktuellePerson = !!pmEmail && pmEmail === (me?.email || '').toLowerCase();
  const darfAendern = !!project?.id && (darf('leitung') || istAktuellePerson);

  const anzeige = person ? (
    <>
      <Kreis person={person} />
      <span><span className="font-semibold text-foreground">{person.name || person.email}</span> · {rolle}</span>
    </>
  ) : (
    <>
      <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-dashed border-[#999999] text-[10px] text-muted-foreground">?</span>
      <span>Keine {rolle} eingetragen</span>
    </>
  );

  if (!darfAendern) {
    return <span className="inline-flex items-center gap-2 text-[13px] text-[#555555]">{anzeige}</span>;
  }

  const waehle = async (m) => {
    if (!m?.email || (m.email || '').toLowerCase() === pmEmail) return;
    setLaeuft(true);
    setFehler('');
    try {
      await base44.entities.Project.update(project.id, { pm_email: m.email });
      await schreibeSystemEintrag({
        project_id: project.id,
        text: `${rolle} von „${person?.name || project.pm_email || '—'}" auf „${m.name || m.email}" geändert.`,
      }).catch(() => null);
      await ladeAnsichtenNachTicketAenderung(queryClient);
    } catch (e) {
      setFehler(e?.message || 'Konnte nicht gespeichert werden');
    }
    setLaeuft(false);
  };

  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-[#555555]">
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={laeuft}
          title={`${rolle} ändern`}
          className="group -mx-1 inline-flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground disabled:opacity-60"
        >
          {anzeige}
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground opacity-60 group-hover:opacity-100" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{rolle} wählen</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {mitglieder.map((m) => {
            const aktiv = (m.email || '').toLowerCase() === pmEmail;
            return (
              <DropdownMenuItem key={m.id || m.email} onClick={() => waehle(m)} className="gap-2">
                <Kreis person={m} size={24} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{m.name || m.email}</span>
                  {(m.roles || []).length > 0 && (
                    <span className="truncate text-xs text-muted-foreground">{m.roles.join(', ')}</span>
                  )}
                </span>
                {aktiv && <Check className="w-4 h-4 shrink-0" />}
              </DropdownMenuItem>
            );
          })}
          {mitglieder.length === 0 && (
            <DropdownMenuItem disabled className="text-xs">Keine aktiven Teammitglieder</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {laeuft && <span className="text-xs text-muted-foreground">speichert…</span>}
      {fehler && <span className="text-xs text-status-critical">{fehler}</span>}
    </span>
  );
}
