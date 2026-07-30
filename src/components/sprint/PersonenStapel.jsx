import React from 'react';
import { Plus } from 'lucide-react';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { initials, personColor } from '@/components/sprint/PersonenChip';

// Gestapelte Kürzel-Chips: alle Personen mit mindestens einer Aufgabe, ab 4 gezählt.
export default function PersonenStapel({ members = [], currentUserEmail, size = 24 }) {
  if (members.length === 0) {
    return (
      <span
        className="rounded-full flex items-center justify-center"
        style={{ width: size, height: size, border: `1.5px dashed ${RITTLER.decorGray}`, color: RITTLER.textSecondary }}
        title="niemand zugewiesen"
      >
        <Plus className="w-3 h-3" />
      </span>
    );
  }

  const shown = members.length > 4 ? members.slice(0, 3) : members;
  const overflow = members.length - shown.length;

  return (
    <div className="flex items-center">
      {shown.map((m, i) => (
        <span
          key={m.email}
          title={m.name}
          className="rounded-full flex items-center justify-center text-[10px] font-bold uppercase text-white"
          style={{
            width: size,
            height: size,
            backgroundColor: personColor(m),
            marginLeft: i === 0 ? 0 : -8,
            boxShadow: m.email === currentUserEmail ? 'inset 0 0 0 2px #ffffff' : undefined,
          }}
        >
          {initials(m.name)}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="rounded-full flex items-center justify-center text-[10px] font-bold"
          style={{ width: size, height: size, marginLeft: -8, backgroundColor: RITTLER.surface, color: RITTLER.textSecondary }}
          title={members.slice(3).map((m) => m.name).join(', ')}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}