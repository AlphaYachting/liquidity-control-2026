import React from 'react';

// KI-Vorklassifizierung im Kartenkopf — Empfehlung, keine Sperre.
export function suggestionMeta(item) {
  if (item.suggested_action === 'supportticket') return { label: 'Supportticket', color: 'bg-blue-100 text-blue-700' };
  if (item.suggested_action === 'anfrage') {
    return item.is_known_customer
      ? { label: 'Bestandskunde-Anfrage', color: 'bg-emerald-100 text-emerald-700' }
      : { label: 'Neue Anfrage', color: 'bg-violet-100 text-violet-700' };
  }
  return null;
}

export default function InboxSuggestionLabel({ item }) {
  const meta = suggestionMeta(item);
  if (!meta) return null;
  return (
    <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${meta.color}`}>
      {meta.label}
    </span>
  );
}