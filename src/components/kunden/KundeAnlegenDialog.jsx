import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import ClientLinkStep from '@/components/crm/handover/ClientLinkStep';

// Kundenverzeichnis: Kunde anlegen oder einen bestehenden Kunden mit sevDesk verknüpfen.
// Nutzt denselben Kunden-Baustein wie die CRM-Übergabe — es gibt nur einen Anlageweg.
//   client = null  → neuer Kunde (mit Kontaktfeldern)
//   client = {...} → bestehender Kunde ohne sevDesk-Verknüpfung
export default function KundeAnlegenDialog({ open, onOpenChange, client: start = null, onSaved }) {
  const [client, setClient] = useState(start);

  useEffect(() => { if (open) setClient(start); }, [open, start]);

  const schliessen = () => {
    onOpenChange(false);
    onSaved?.(client);
  };

  const adresse = start
    ? [start.street, [start.zip, start.city].filter(Boolean).join(' '), start.country_code].filter(Boolean).join(', ')
    : '';

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : schliessen())}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="uppercase font-bold text-foreground">
            {start ? 'Kunde mit sevDesk verknüpfen' : 'Kunde anlegen'}
          </DialogTitle>
        </DialogHeader>
        {open && (
          <ClientLinkStep
            key={start?.id || 'neu'}
            kunde={start?.name || ''}
            deal={start ? { contact_name: start.contact_person, contact_email: start.contact_email, company_address: adresse } : null}
            client={client}
            onClient={setClient}
            kontaktFelder={!start}
          />
        )}
        <DialogFooter>
          <Button variant="outline" className="rounded" onClick={schliessen}>
            {client?.sevdesk_contact_id ? 'Fertig' : 'Schließen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
