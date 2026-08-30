import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Woher der Entwurf seinen Stoff nimmt — plus Nachtrag der E-Mail-Adresse.
export default function QuellenChip({ deal, to, setTo, onChanged }) {
  const [entwurf, setEntwurf] = useState('');

  const uebernehmen = async () => {
    const wert = entwurf.trim();
    if (!wert) return;
    await base44.entities.CrmDeal.update(deal.id, { contact_email: wert });
    setTo(wert);
    setEntwurf('');
    onChanged?.();
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="bg-muted rounded-full px-2.5 py-1 text-[11.5px] text-muted-foreground">
          {deal.email_thread_id
            ? `Quelle für den Entwurf: E-Mail-Verlauf mit ${deal.contact_name || 'dem Kontakt'}`
            : 'Kein E-Mail-Verlauf — Quelle: Anfragetext und Verlaufseinträge'}
        </span>
        {deal.email_thread_id && (
          <Link to={`/crm/emails?thread=${deal.email_thread_id}`} className="text-[11.5px] text-primary hover:underline">
            Verlauf öffnen
          </Link>
        )}
      </div>

      {!to && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={entwurf}
            onChange={(e) => setEntwurf(e.target.value)}
            placeholder="E-Mail-Adresse des Kontakts"
            className="h-8 w-64 text-sm"
          />
          <Button size="sm" variant="outline" onClick={uebernehmen} disabled={!entwurf.trim()}>
            Adresse übernehmen
          </Button>
          <span className="text-xs text-muted-foreground">
            Ohne Adresse lässt sich ein Entwurf erzeugen, aber nicht senden.
          </span>
        </div>
      )}
    </div>
  );
}