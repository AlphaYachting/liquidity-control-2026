import React from 'react';
import StatusEtikett from '@/components/shared/StatusEtikett';

// KI-Vorklassifizierung — Empfehlung, keine Sperre.
export function suggestionMeta(item) {
  if (item.suggested_action === 'supportticket') return { label: 'Supportticket' };
  if (item.suggested_action === 'anfrage') {
    return item.is_known_customer ? { label: 'Bestandskunde-Anfrage' } : { label: 'Neue Anfrage' };
  }
  return null;
}

export default function InboxSuggestionLabel({ item }) {
  const meta = suggestionMeta(item);
  if (!meta) return null;
  return <StatusEtikett ton="neutral">{meta.label}</StatusEtikett>;
}