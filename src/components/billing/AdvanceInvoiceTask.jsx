import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import RecordSevdeskInvoiceDialog from './RecordSevdeskInvoiceDialog';

// Offene Anzahlung = Aufgabe für den Menschen: in sevDesk AB + Anzahlungsrechnung ausstellen,
// danach die ausgestellte Rechnung hier erfassen.
export default function AdvanceInvoiceTask({ instruction, onRecorded }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-status-attention whitespace-nowrap">
          AB + Anzahlungsrechnung in sevDesk erstellen
        </span>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(true)}>
          <FileText className="w-3 h-3 mr-1" /> Rechnung erfassen
        </Button>
      </div>
      <RecordSevdeskInvoiceDialog
        instruction={instruction}
        open={open}
        onClose={() => setOpen(false)}
        onRecorded={onRecorded}
      />
    </>
  );
}