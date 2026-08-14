import { Handshake, MessageSquare, FileText } from 'lucide-react';

// Eintragsarten des digitalen Kundenakts — Symbol und Beschriftung an einer Stelle.
export const ENTRY_TYPES = {
  vereinbarung: { icon: Handshake, label: 'Vereinbarung', color: 'bg-status-done-surface text-status-done-text' },
  update: { icon: MessageSquare, label: 'Update', color: 'bg-status-attention-surface text-status-attention' },
  dokument: { icon: FileText, label: 'Dokument', color: 'bg-muted text-muted-foreground' },
};

export const formatEntryDate = (v) =>
  new Date(v).toLocaleString('de-AT', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });