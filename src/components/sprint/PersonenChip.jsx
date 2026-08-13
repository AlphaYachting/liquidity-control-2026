import React from 'react';
import { Plus } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { RITTLER } from '@/components/sprint/sprintConfig';

export const PERSON_COLORS = ['#2E5AAC', '#1F6F6B', '#5B3E96', '#8A4B2A', '#465A70', '#7A2E5E', '#145C86', '#33415C'];

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

// V2 — Personen-Chip: Farbe lebt ausschließlich in dieser Fläche, Initialen sind zwingend.
export default function PersonenChip({ member, members = [], role, isMe, disabled, onAssign }) {
  const chip = member ? (
    <span
      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold uppercase text-white shrink-0"
      style={{
        backgroundColor: personColor(member),
        boxShadow: isMe ? 'inset 0 0 0 2px #ffffff' : undefined,
      }}
    >
      {initials(member.name)}
    </span>
  ) : (
    <span
      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
      style={{ border: `1.5px dashed ${RITTLER.decorGray}`, color: RITTLER.textSecondary }}
    >
      <Plus className="w-3.5 h-3.5" />
    </span>
  );

  if (disabled || !onAssign) return chip;

  const suggested = role ? members.filter((m) => (m.roles || []).includes(role)) : [];
  const others = members.filter((m) => !suggested.includes(m));

  const row = (m) => (
    <DropdownMenuItem key={m.email} onClick={() => onAssign(m.email)} className="gap-2">
      <span
        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold uppercase text-white"
        style={{ backgroundColor: personColor(m) }}
      >
        {initials(m.name)}
      </span>
      <span className="text-sm">{m.name}</span>
      <span className="text-xs" style={{ color: RITTLER.textSecondary }}>{(m.roles || []).join(', ')}</span>
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title={member ? `${member.name}${(member.roles || []).length ? ` · ${(member.roles || []).join(', ')}` : ''}` : 'zuweisen'}
        className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
      >
        {chip}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        {suggested.map(row)}
        {others.map(row)}
        <DropdownMenuItem onClick={() => onAssign('')} className="text-xs" style={{ color: RITTLER.textSecondary }}>
          nicht zugewiesen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}