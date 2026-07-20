import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { History } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import { Input } from '@/components/ui/input';
import AuditTrailTable from '@/components/audit/AuditTrailTable';

export default function AuditTrail() {
  const [search, setSearch] = useState('');

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => base44.entities.AuditLog.list('-created_date', 500),
  });

  const q = search.trim().toLowerCase();
  const filtered = q
    ? logs.filter((l) =>
        [l.user_email, l.entity_type, l.entity_id, l.action, l.details, l.new_value]
          .some((v) => (v || '').toLowerCase().includes(q)))
    : logs;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Änderungsprotokoll"
        subtitle="Alle Datenänderungen, zugeordnet zum Benutzer-Login"
        icon={History}
      />
      <Input
        placeholder="Suchen (Benutzer, Datentyp, Aktion…)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Protokoll lädt…</p>
      ) : (
        <AuditTrailTable logs={filtered} />
      )}
    </div>
  );
}