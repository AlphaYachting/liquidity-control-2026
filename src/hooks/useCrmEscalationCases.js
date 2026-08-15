import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Eskalations-Vorgänge (Zweitschrift in der App) — Schlüssel ist die thread_id.
export function useCrmEscalationCases() {
  return useQuery({
    queryKey: ['crm-escalations'],
    queryFn: () => base44.entities.CrmEscalation.list('-created_at', 300),
  });
}

// Ein Vorgang gilt als sichtbar, solange er nicht erledigt und nicht bis in die
// Zukunft zurückgestellt ist.
export function isCaseVisible(c) {
  if (!c) return true;
  if (c.state === 'erledigt') return false;
  if (c.state === 'snooze' && c.snooze_until && new Date(c.snooze_until) > new Date()) return false;
  return true;
}