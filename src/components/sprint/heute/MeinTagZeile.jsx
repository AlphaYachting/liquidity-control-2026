import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, Play, Square } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { useTimer } from '@/lib/sprint/useTimer';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { RITTLER, STATUS_COLORS, fmtDate } from '@/components/sprint/sprintConfig';
import { projectTypeOf, typeStyleOf } from '@/components/sprint/projectTypes';
import { istUeberfaellig } from '@/lib/sprint/faelligkeit';
import { ladeAnsichtenNachTicketAenderung } from '@/lib/sprint/ansichtenNeuLaden';
import { ticketZiel } from '@/components/sprint/heute/MeinTagBausteine';

const CYCLE = { offen: 'in_arbeit', in_arbeit: 'erledigt', erledigt: 'offen', wartet: 'in_arbeit' };
const STATUS_WORT = { offen: 'offen', in_arbeit: 'in Arbeit', wartet: 'wartet', erledigt: 'erledigt' };
const RHYTHMUS = { woechentlich: 'wöchentlich', '14taegig': 'alle 14 Tage', monatlich: 'monatlich', '2monatlich': 'alle 2 Monate', quartalsweise: 'quartalsweise', halbjaehrlich: 'halbjährlich', jaehrlich: 'jährlich', manuell: 'manuell' };
const WOCHENTAG = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtH = (v) => new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 }).format(v || 0);
const kurz = (d) => fmtDate(d).slice(0, 6);

// Statuspunkt links: ein Klick schaltet weiter (offen → in Arbeit → erledigt); „wartet" liegt im kleinen Menü.
function StatusPunkt({ status = 'offen', onChange }) {
  const punkt = {
    offen: <span className="block w-4 h-4 rounded-full border-2" style={{ borderColor: '#8a8a8a' }} />,
    in_arbeit: <span className="block w-4 h-4 rounded-full" style={{ backgroundColor: '#6b6b6b' }} />,
    wartet: <span className="block w-4 h-4 rounded-full border-2" style={{ borderColor: STATUS_COLORS.attention, backgroundColor: STATUS_COLORS.attentionSurface }} />,
    erledigt: (
      <span className="flex w-4 h-4 rounded-full items-center justify-center" style={{ backgroundColor: RITTLER.black }}>
        <Check className="w-2.5 h-2.5 text-white" strokeWidth={4} />
      </span>
    ),
  }[status] || null;
  return (
    <div className="flex items-center shrink-0">
      <button
        type="button"
        onClick={() => onChange(CYCLE[status] || 'in_arbeit')}
        aria-label={`Status: ${STATUS_WORT[status] || status} – weiterschalten`}
        title={`${STATUS_WORT[status] || status} – klicken schaltet weiter`}
        className="w-9 h-11 flex items-center justify-center rounded hover:bg-muted"
      >
        {punkt}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger className="w-4 h-11 flex items-center justify-center text-muted-foreground/60 hover:text-foreground" aria-label="Status wählen">
          <ChevronDown className="w-3 h-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {Object.keys(STATUS_WORT).map((k) => (
            <DropdownMenuItem key={k} onClick={() => onChange(k)}>{STATUS_WORT[k]}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Termin rechts: Datum anzeigen und verschieben, oder „Termin setzen".
function Termin({ ticket, heute, mitHeute = false }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const aufHeute = async () => {
    await base44.entities.Ticket.update(ticket.id, { planned_for: heute });
    ladeAnsichtenNachTicketAenderung(queryClient);
  };
  const speichern = async (d) => {
    setOpen(false);
    if (!d && ticket.rhythmus) return;
    await base44.entities.Ticket.update(ticket.id, { planned_for: d ? iso(d) : null });
    ladeAnsichtenNachTicketAenderung(queryClient);
  };
  const p = ticket.planned_for;
  const ueberfaellig = istUeberfaellig(ticket, heute);
  let text = 'Termin setzen';
  let stil = { color: RITTLER.textSecondary, textDecoration: 'underline' };
  if (p && ueberfaellig) { text = `seit ${kurz(p)}`; stil = { color: STATUS_COLORS.critical, fontWeight: 700 }; }
  else if (p && p === heute) { text = 'heute'; stil = { color: RITTLER.black, fontWeight: 600 }; }
  else if (p) { text = `${WOCHENTAG[new Date(`${p}T00:00:00`).getDay()]} ${kurz(p)}`; stil = { color: RITTLER.textSecondary, fontWeight: 600 }; }

  return (
    <>
      {mitHeute && !p && (
        <button
          type="button"
          onClick={aufHeute}
          title="Für heute einplanen"
          className="shrink-0 h-8 px-2.5 rounded border border-[#d4d4d4] bg-white text-[12.5px] font-semibold text-foreground whitespace-nowrap hover:bg-muted"
        >
          Heute
        </button>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="shrink-0 h-11 px-2 rounded text-[12.5px] whitespace-nowrap hover:bg-muted" style={stil} title="Termin ändern">
            {text}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar mode="single" selected={p ? new Date(`${p}T00:00:00`) : undefined} onSelect={speichern} initialFocus />
        </PopoverContent>
      </Popover>
    </>
  );
}

// Timer direkt auf diese Aufgabe — läuft er hier, stoppt und bucht derselbe Knopf.
function TimerKnopfZeile({ ticket, project, client }) {
  const { user } = useAuth();
  const { timer, running, label, start, stop } = useTimer(user?.email);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  if (!user?.email || !project?.id) return null;
  const laeuftHier = running && timer?.ticket_id === ticket.id;

  const klick = async () => {
    setBusy(true);
    if (laeuftHier) {
      const res = await stop();
      if (res?.fehler) toast({ description: res.fehler });
      else if (res) toast({ description: `${res.hours} h auf ${res.projekt || project.title} gebucht.` });
    } else {
      await start(project, (client?.name || project.title).slice(0, 3).toUpperCase(), '', { force: true, ticketId: ticket.id });
      toast({ description: 'Timer läuft.' });
    }
    qc.invalidateQueries({ queryKey: ['ticketHours'] });
    qc.invalidateQueries({ queryKey: ['sprintHeute'] });
    setBusy(false);
  };

  return (
    <button
      type="button"
      onClick={klick}
      disabled={busy}
      aria-label={laeuftHier ? 'Timer stoppen und buchen' : 'Timer auf diese Aufgabe starten'}
      title={laeuftHier ? `${label} · stoppen und buchen` : 'Timer auf diese Aufgabe starten'}
      className={`shrink-0 h-11 rounded flex items-center justify-center gap-1.5 text-[12.5px] font-semibold tabular-nums disabled:opacity-60 ${
        laeuftHier ? 'px-3 bg-primary text-white' : 'w-11 bg-white border border-[#d4d4d4] text-foreground hover:bg-muted'
      }`}
    >
      {laeuftHier ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
      {laeuftHier && label}
    </button>
  );
}

// Kleine Typ-Kennzeichnung in den Projekttyp-Farben (Sprint, Retainer, Wartung, Support, Regie).
export function TypKuerzel({ project }) {
  if (!project) return null;
  const s = typeStyleOf(project);
  return (
    <span className="shrink-0 text-[11px] font-bold px-[7px] py-[3px] rounded-[2px]" style={{ backgroundColor: s.pillBg, color: s.pillText }}>
      {s.short}
    </span>
  );
}

// Aufgabenzeile von „Mein Tag".
//  variante "voll"   — Statuspunkt · Titel + Kontext · Typ · Termin · Timer
//  variante "gruppe" — Statuspunkt · Titel · Sollstunden/Leistungsbereich · Termin setzen (Projekt steht im Gruppenkopf)
export default function MeinTagZeile({
  ticket, project, client, milestone, modulName, projektName, heute, onStatusChange,
  variante = 'voll', mitTimer = true,
}) {
  const ziel = ticketZiel(ticket, milestone, project);
  const erledigt = ticket.status === 'erledigt';
  const istSprint = !!project && projectTypeOf(project) === 'sprint';

  if (variante === 'gruppe') {
    const info = ticket.target_hours ? `${fmtH(ticket.target_hours)} h Ziel` : modulName;
    return (
      <div className="flex items-center gap-2 min-h-[48px] border-b border-border last:border-0">
        <StatusPunkt status={ticket.status} onChange={(s) => onStatusChange(ticket, s)} />
        <Link to={ziel} className="flex-1 min-w-0 text-sm font-semibold truncate hover:underline" style={{ color: RITTLER.black }}>
          {ticket.title}
        </Link>
        {info && <span className="shrink-0 text-[12.5px] hidden sm:inline" style={{ color: RITTLER.textSecondary }}>{info}</span>}
        <Termin ticket={ticket} heute={heute} mitHeute />
        {ticket.status === 'in_arbeit' && <TimerKnopfZeile ticket={ticket} project={project} client={client} />}
      </div>
    );
  }

  const kontext = [
    projektName,
    istSprint ? milestone?.title : modulName,
    ticket.rhythmus ? RHYTHMUS[ticket.rhythmus] : null,
    ticket.target_hours ? `${fmtH(ticket.target_hours)} h Ziel` : null,
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-2 sm:gap-3 min-h-[52px] py-1 border-b border-border last:border-0">
      <StatusPunkt status={ticket.status} onChange={(s) => onStatusChange(ticket, s)} />
      <Link to={ziel} className="flex-1 min-w-0 group">
        <span className="block text-sm font-semibold truncate group-hover:underline" style={{ color: RITTLER.black }}>{ticket.title}</span>
        {kontext.length > 0 && (
          <span className="block text-[12.5px] truncate" style={{ color: RITTLER.textSecondary }}>{kontext.join(' · ')}</span>
        )}
      </Link>
      <span className="hidden sm:inline-flex"><TypKuerzel project={project} /></span>
      {ticket.planned_for && !erledigt && <Termin ticket={ticket} heute={heute} />}
      {mitTimer && !erledigt && <TimerKnopfZeile ticket={ticket} project={project} client={client} />}
    </div>
  );
}
