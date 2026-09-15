import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ExternalLink, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// Zeigt die erstellte Abrechnung — und erlaubt, sie zurückzunehmen,
// damit die Support-Anfragen wieder zur Verrechnung erscheinen.
export default function SupportInstructionBadge({ instruction, onDone }) {
  const [busy, setBusy] = useState(false);
  const bezahlt = instruction.live_status?.status_code === '1000';

  const zuruecknehmen = async () => {
    if (!window.confirm('Abrechnung zurücknehmen? Die Anfragen erscheinen dann wieder. Den Entwurf in sevDesk bitte dort löschen.')) return;
    setBusy(true);
    try {
      await base44.entities.BillingInstruction.delete(instruction.id);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="flex items-center gap-1">
      <Badge className={bezahlt ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}>
        {instruction.live_status
          ? `${instruction.live_status.invoice_number || 'Entwurf'} — ${instruction.live_status.status_label}`
          : 'Anweisung ohne sevDesk-Rechnung'}
      </Badge>
      {instruction.sevdesk_invoice_url && (
        <a href={instruction.sevdesk_invoice_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
      <button
        onClick={zuruecknehmen}
        disabled={busy}
        title="Abrechnung zurücknehmen"
        className="text-muted-foreground hover:text-red-600 disabled:opacity-50"
      >
        <Undo2 className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}