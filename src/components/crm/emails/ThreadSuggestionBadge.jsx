import React from 'react';
import { Badge } from '@/components/ui/badge';
import { HelpCircle } from 'lucide-react';
import { SUGGESTION_META, REQUEST_NATURE_LABELS } from '@/components/crm/emails/suggestionMeta';

// Etikett im Kopf jeder Konversation: nur ein Vorschlag, der Mensch entscheidet unten.
export default function ThreadSuggestionBadge({ thread }) {
  const meta = SUGGESTION_META[thread?.suggested_action];
  if (!meta) return null;
  const unsicher = thread.customer_match === 'unsicher';
  const nature = REQUEST_NATURE_LABELS[thread.request_nature] || thread.request_nature || '';
  const tooltip = [
    nature && `Anliegen: ${nature}`,
    thread.request_nature_evidence && `Beleg: „${thread.request_nature_evidence}"`,
    unsicher && 'Kundenzuordnung unsicher (Freemail-Absender)',
  ].filter(Boolean).join('\n');

  return (
    <Badge variant="outline" className={`text-[10px] border-0 gap-1 ${meta.color}`} title={tooltip || undefined}>
      KI-Vorschlag: {meta.label}
      {unsicher && <HelpCircle className="w-3 h-3" />}
    </Badge>
  );
}