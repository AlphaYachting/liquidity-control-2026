import React from 'react';
import { Badge } from '@/components/ui/badge';
import { getStatusColor } from '@/lib/liquidityUtils';

const LABELS = {
  paid: 'Bezahlt', invoiced: 'Verrechnet', planned: 'Geplant', active: 'Aktiv',
  uncertain: 'Unsicher', unclear: 'Unklar', overdue: 'Überfällig', critical: 'Kritisch',
  cancelled: 'Storniert', open: 'Offen', completed: 'Abgeschlossen', on_hold: 'Pausiert',
  pending: 'Ausstehend', paused: 'Pausiert', disputed: 'Strittig', deferred: 'Verschoben',
  scheduled: 'Geplant', partially_paid: 'Teilbezahlt', write_off: 'Abschreibung',
  not_invoiced: 'Nicht verrechnet',
};

export default function StatusBadge({ status, className = '' }) {
  if (!status) return null;
  return (
    <Badge variant="outline" className={`text-xs font-medium border ${getStatusColor(status)} ${className}`}>
      {LABELS[status] || status}
    </Badge>
  );
}