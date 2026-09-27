import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, ExternalLink } from 'lucide-react';
import ClientLinkStep from '@/components/crm/handover/ClientLinkStep';

// Übernimmt die Positionen des E-Mail-Angebots als Angebotsentwurf nach sevDesk.
export default function SevdeskAngebotKarte({ quote, items, onDone }) {
  const [offen, setOffen] = useState(false);
  const [client, setClient] = useState(null);
  const [saving, setSaving] = useState(false);
  const [fehler, setFehler] = useState('');

  const positions = (items || [])
    .filter((i) => i.title && Number(i.total_price || i.unit_price) > 0)
    .map((i) => ({
      name: i.title,
      text: i.description || '',
      quantity: Number(i.quantity) || 1,
      amount: Number(i.unit_price) || Number(i.total_price) || 0,
    }));

  const anlegen = async () => {
    setSaving(true); setFehler('');
    const { data } = await base44.functions.invoke('createSevdeskAngebotUndAb', {
      sevdesk_contact_id: client.sevdesk_contact_id, positions, nur_angebot: true,
      address: [client.name, client.contact_person, client.street, [client.zip, client.city].filter(Boolean).join(' ')]
        .filter(Boolean).join('\n'),
      vat_rate: quote.vat_rate ?? 20, header: quote.title || 'Angebot', head_text: quote.intro_text || '',
    });
    if (!data?.success) { setFehler(data?.error || 'Unbekannter Fehler'); setSaving(false); return; }
    await base44.entities.CrmQuote.update(quote.id, {
      sevdesk_quote_id: data.quote_id, sevdesk_quote_number: data.quote_number, sevdesk_quote_url: data.quote_url,
    });
    setSaving(false);
    onDone?.();
  };

  if (quote.sevdesk_quote_id) {
    return (
      <div className="bg-card border rounded-lg px-4 py-3 flex items-center justify-between gap-3">
        <p className="text-sm">In sevDesk angelegt{quote.sevdesk_quote_number ? ` · ${quote.sevdesk_quote_number}` : ''}</p>
        <Button variant="outline" size="sm" asChild>
          <a href={quote.sevdesk_quote_url} target="_blank" rel="noreferrer"><ExternalLink /> In sevDesk öffnen</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-card border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-value">sevDesk-Angebot</p>
          <p className="text-meta text-muted-foreground">{positions.length} Positionen als Angebotsentwurf übernehmen</p>
        </div>
        {!offen && <Button variant="outline" size="sm" disabled={!positions.length} onClick={() => setOffen(true)}>In sevDesk anlegen</Button>}
      </div>
      {offen && (
        <>
          <ClientLinkStep
            deal={{ company_name: quote.customer_name, contact_name: quote.contact_name, contact_email: quote.contact_email }}
            kunde={quote.customer_name || ''} client={client} onClient={setClient}
          />
          {fehler && <p className="text-meta text-status-critical">{fehler}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOffen(false)}>Abbrechen</Button>
            <Button size="sm" disabled={saving || !client?.sevdesk_contact_id} onClick={anlegen}>
              {saving && <Loader2 className="animate-spin" />} Angebot anlegen
            </Button>
          </div>
        </>
      )}
    </div>
  );
}