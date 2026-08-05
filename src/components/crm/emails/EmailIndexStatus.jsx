import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Database } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { formatMailDate } from '@/components/crm/emails/emailConfig';

// Stand des eigenen Verlaufs-Verzeichnisses — zeigt, wie vollständig die
// Arbeitsliste ist und wie weit der historische Nachlauf gekommen ist.
export default function EmailIndexStatus() {
  const { data } = useQuery({
    queryKey: ['email-index-state'],
    queryFn: async () => {
      const [state] = await base44.entities.EmailIndexState.list('-created_date', 1);
      const rows = await base44.entities.EmailThreadIndex.filter({}, '-indexed_at', 1);
      return { state, hasRows: rows.length > 0 };
    },
    staleTime: 60 * 1000,
    retry: false,
  });

  const s = data?.state;
  if (!s) return null;

  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground border rounded-md px-2.5 py-1.5 bg-card">
      <Database className="w-3.5 h-3.5 text-primary" />
      <span>
        Verzeichnis {s.backfill_done ? 'vollständig' : `Nachlauf läuft (${s.backfill_cursor || 0} Verläufe geholt)`}
      </span>
      {s.last_window_run_at && <span>· aktualisiert {formatMailDate(s.last_window_run_at)}</span>}
    </div>
  );
}