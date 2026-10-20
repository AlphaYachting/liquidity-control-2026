import React, { useEffect, useState } from 'react';
import { Plus, Check } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { RITTLER } from '@/components/sprint/sprintConfig';

export const PERSON_COLORS = ['#2E5AAC', '#1F6F6B', '#5B3E96', '#8A4B2A', '#465A70', '#7A2E5E', '#145C86', '#33415C'];
const MAX_PERSONEN = 4;

export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';

// Fallback, solange TeamMember.color noch nicht gepflegt ist — stabil pro E-Mail.
export const personColor = (member) => {
  if (member?.color) return member.color;
  const key = member?.email || '';
  let sum = 0;
  for (let i = 0; i < key.length; i += 1) sum += key.charCodeAt(i);
  return PERSON_COLORS[sum % PERSON_COLORS.length];
};

const klein = (s) => String(s || '').trim().toLowerCase();

const Kreis = ({ member, isMe, abstand = 0 }) => (
  <span
    className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold uppercase text-white shrink-0"
    style={{
      backgroundColor: personColor(member),
      boxShadow: isMe ? 'inset 0 0 0 2px #ffffff' : (abstand ? '0 0 0 2px #ffffff' : undefined),
      marginLeft: abstand,
    }}
  >
    {initials(member.name)}
  </span>
);

const Leer = () => (
  <span
    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
    style={{ border: `1.5px dashed ${RITTLER.decorGray}`, color: RITTLER.textSecondary }}
  >
    <Plus className="w-3.5 h-3.5" />
  </span>
);

// V2 — Personen-Chip: Farbe lebt ausschließlich in dieser Fläche, Initialen sind zwingend.
// Zwei Betriebsarten:
//  - Einzelauswahl (member + onAssign): eine Person, z. B. Betreuer eines Moduls.
//  - Zuständige eines Tickets (zustaendige + onToggle): bis zu vier gleichwertige Personen,
//    Häkchen in derselben Liste, das Menü bleibt beim Anhaken offen. Bei einer Person sieht
//    der Kreis exakt so aus wie in der Einzelauswahl; mehrere stehen überlappend nebeneinander.
export default function PersonenChip({
  member, members = [], role, isMe, disabled, onAssign,
  zustaendige, currentUserEmail, onToggle, onLeeren,
}) {
  const mehrfach = Array.isArray(zustaendige);
  // Lokale Auswahl, damit Häkchen sofort stehen — wird beim nächsten Laden aus den Daten übernommen
  const [auswahl, setAuswahl] = useState(() => (mehrfach ? zustaendige.map((p) => klein(p.email)) : []));
  const [hinweis, setHinweis] = useState('');
  const datenSchluessel = mehrfach ? zustaendige.map((p) => klein(p.email)).join('|') : '';
  useEffect(() => { if (mehrfach) setAuswahl(datenSchluessel ? datenSchluessel.split('|') : []); }, [datenSchluessel, mehrfach]);

  const ich = klein(currentUserEmail);
  const personen = mehrfach
    ? auswahl.map((e) => zustaendige.find((p) => klein(p.email) === e) || members.find((m) => klein(m.email) === e) || { email: e, name: e })
    : [];

  let chip;
  if (!mehrfach) {
    chip = member ? <Kreis member={member} isMe={isMe} /> : <Leer />;
  } else if (!personen.length) {
    chip = <Leer />;
  } else {
    chip = (
      <span className="flex items-center">
        {personen.map((p, i) => <Kreis key={p.email} member={p} isMe={!!ich && klein(p.email) === ich} abstand={i ? -8 : 0} />)}
      </span>
    );
  }

  const bearbeitbar = !disabled && (mehrfach ? !!onToggle : !!onAssign);
  if (!bearbeitbar) return chip;

  const suggested = role ? members.filter((m) => (m.roles || []).includes(role)) : [];
  const others = members.filter((m) => !suggested.includes(m));

  const waehle = (e, m) => {
    if (!mehrfach) { onAssign(m.email); return; }
    e.preventDefault(); // Menü bleibt offen, weitere Personen lassen sich anhaken
    const key = klein(m.email);
    const war = auswahl.includes(key);
    if (!war && auswahl.length >= MAX_PERSONEN) { setHinweis('Höchstens vier Personen'); return; }
    setHinweis('');
    setAuswahl((a) => (war ? a.filter((x) => x !== key) : [...a, key]));
    onToggle(m.email, war);
  };

  const row = (m) => {
    const gewaehlt = mehrfach && auswahl.includes(klein(m.email));
    return (
      <DropdownMenuItem key={m.email} onSelect={(e) => waehle(e, m)} className="gap-2">
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold uppercase text-white"
          style={{ backgroundColor: personColor(m) }}
        >
          {initials(m.name)}
        </span>
        <span className="text-sm">{m.name}</span>
        <span className="text-xs" style={{ color: RITTLER.textSecondary }}>{(m.roles || []).join(', ')}</span>
        {mehrfach && (
          <span className="ml-auto pl-3 w-7 flex justify-end">
            {gewaehlt && <Check className="w-4 h-4" style={{ color: RITTLER.black }} />}
          </span>
        )}
      </DropdownMenuItem>
    );
  };

  const titel = mehrfach
    ? (personen.length ? personen.map((p) => p.name || p.email).join(', ') : 'zuweisen')
    : (member ? `${member.name}${(member.roles || []).length ? ` · ${(member.roles || []).join(', ')}` : ''}` : 'zuweisen');

  return (
    <DropdownMenu onOpenChange={(o) => { if (!o) setHinweis(''); }}>
      <DropdownMenuTrigger
        title={titel}
        className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
      >
        {chip}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        {suggested.map(row)}
        {others.map(row)}
        {hinweis && (
          <p className="px-2 py-1 text-xs" style={{ color: RITTLER.textSecondary }}>{hinweis}</p>
        )}
        <DropdownMenuItem
          onSelect={() => { if (mehrfach) { setAuswahl([]); onLeeren?.(); } else onAssign(''); }}
          className="text-xs"
          style={{ color: RITTLER.textSecondary }}
        >
          nicht zugewiesen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
