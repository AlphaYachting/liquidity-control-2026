import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarClock, Loader2 } from 'lucide-react';
import PersonenChip from '@/components/sprint/PersonenChip';
import { useAuth } from '@/lib/AuthContext';
import { useZugriff } from '@/lib/useZugriff';
import { ladeMeetingKontext } from '@/lib/meeting/meetingAuswertung';
import { crWaehlbar, crArt, istLeitung, zeileZuTicket } from '@/lib/meeting/meetingZeilen';
import { pruefeZeile, etappeFreigegeben } from '@/lib/sprint/ticketAnlage';

const klein = (s) => String(s || '').trim().toLowerCase();

// Kontext für Zusagen-Aufgaben (Etappen, Team, Projekttyp, Leitungsrecht) — einmal je Projekt
export function useAufgabenKontext(projectId, enabled = true) {
  const { user } = useAuth();
  const zugriff = useZugriff();
  const { data: ctx, isLoading } = useQuery({
    queryKey: ['aufgabenKontext', projectId],
    queryFn: () => ladeMeetingKontext(projectId),
    enabled: !!projectId && enabled,
    staleTime: 60 * 1000,
  });
  return { ctx, isLoading, user, leitung: istLeitung(user, zugriff, ctx?.projekt) };
}

export const leereZusage = (titel = '', termin = '') => ({
  key: 'zusage', titel, art: 'rittler', assignee_emails: [], termin, milestone_id: '', change_request: false,
});

// Ticket-Daten + Prüfung einer Zusage-Zeile
export function zusageAlsTicket(wert, { ctx, leitung, herkunftText, projektaktId }) {
  const etappeVon = Object.fromEntries((ctx?.etappen || []).map((m) => [m.id, m]));
  const milestoneId = wert.milestone_id || (ctx?.etappen?.length === 1 ? ctx.etappen[0].id : '');
  const etappe = etappeVon[milestoneId];
  const ticket = zeileZuTicket({ ...wert, milestone_id: milestoneId }, {
    leitung, projekttyp: ctx?.projekttyp, etappe, meetingDatum: new Date().toISOString().slice(0, 10), projektaktId, herkunftText,
  });
  return { ticket, gruende: pruefeZeile(ticket, etappe) };
}

// Eingabefelder: Aufgabe, Art, Person, Termin, Etappe, ggf. Change Request.
// Person und Termin sind Pflicht — leer, solange nichts gewählt ist.
export default function ZusageAufgabeFelder({ ctx, leitung, wert, onChange, disabled, user }) {
  if (!ctx) {
    return <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Projekt wird geladen …</p>;
  }
  const set = (felder) => onChange({ ...wert, ...felder });
  const memberVon = (email) => ctx.team.find((m) => klein(m.email) === klein(email)) || { email, name: email };
  const milestoneId = wert.milestone_id || (ctx.etappen.length === 1 ? ctx.etappen[0].id : '');
  const etappe = ctx.etappen.find((m) => m.id === milestoneId);
  const art = crArt({ ...wert, milestone_id: milestoneId }, { leitung, projekttyp: ctx.projekttyp, etappe });
  const { gruende } = zusageAlsTicket(wert, { ctx, leitung });

  return (
    <div className="rounded border px-3 py-2.5 space-y-2">
      <p className="text-xs font-medium flex items-center gap-2">
        <CalendarClock className="w-3.5 h-3.5 text-muted-foreground" /> Zusage — wird als Aufgabe angelegt
      </p>
      <Input value={wert.titel} onChange={(e) => set({ titel: e.target.value })} disabled={disabled}
        placeholder="Was wurde zugesagt? z. B. Entwurf der Startseite liefern" className="h-8 text-xs" />
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-[10px] text-muted-foreground">Art</Label>
          <div className="flex gap-1 mt-1">
            {[['rittler', 'Rittler'], ['kunde', 'Wartet auf Kunde']].map(([w, l]) => (
              <button key={w} type="button" disabled={disabled} onClick={() => set({ art: w })}
                className={`h-8 px-2.5 rounded border text-xs ${wert.art === w ? 'border-foreground bg-foreground text-background' : 'border-border'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">{wert.art === 'kunde' ? 'Nachfassen' : 'Zuständig'}</Label>
          <div className="mt-1 h-8 flex items-center">
            <PersonenChip
              members={ctx.team}
              zustaendige={(wert.assignee_emails || []).map(memberVon)}
              currentUserEmail={user?.email}
              disabled={disabled}
              onToggle={(email, war) => set({
                assignee_emails: war
                  ? (wert.assignee_emails || []).filter((e) => klein(e) !== klein(email))
                  : [...(wert.assignee_emails || []), klein(email)],
              })}
              onLeeren={() => set({ assignee_emails: [] })}
            />
          </div>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Bis wann</Label>
          <Input type="date" value={wert.termin} onChange={(e) => set({ termin: e.target.value })}
            disabled={disabled} className="mt-1 h-8 text-xs w-[150px]" />
        </div>
        {ctx.etappen.length > 1 && (
          <div className="min-w-[200px]">
            <Label className="text-[10px] text-muted-foreground">Etappe</Label>
            <Select value={milestoneId || undefined} onValueChange={(v) => set({ milestone_id: v })} disabled={disabled}>
              <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Etappe wählen" /></SelectTrigger>
              <SelectContent>
                {ctx.etappen.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">{m.title}{etappeFreigegeben(m) ? ' · freigegeben' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {crWaehlbar(ctx.projekttyp, etappe) && leitung && (
          <div>
            <Label className="text-[10px] text-muted-foreground">Abrechnung</Label>
            <div className="flex gap-1 mt-1">
              {[[false, 'Im Auftrag'], [true, 'Change Request']].map(([w, l]) => (
                <button key={l} type="button" disabled={disabled} onClick={() => set({ change_request: w })}
                  className={`h-8 px-2.5 rounded border text-xs ${!!wert.change_request === w ? 'border-foreground bg-foreground text-background' : 'border-border'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {art === 'pruefen' && (
        <p className="text-[11px] text-status-attention">Neue Aufgabe in einer freigegebenen Etappe — die Projektleitung entscheidet, ob Change Request.</p>
      )}
      {!ctx.etappen.length && (
        <p className="text-[11px] text-destructive">Dieses Projekt hat keine Etappe — die Zusage kann noch nicht als Aufgabe angelegt werden.</p>
      )}
      {wert.titel.trim() && gruende.length > 0 && (
        <p className="text-[11px] text-destructive">{gruende.join(' · ')}</p>
      )}
    </div>
  );
}
