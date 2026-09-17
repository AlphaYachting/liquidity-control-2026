import { angebotStand } from '@/lib/crm/angebotStille';

// EINE Quelle für den vorgeschlagenen nächsten Schritt — Kopf und Assistent sagen dasselbe.
export function kiVorschlag(deal, activities = [], appointments = []) {
  const stand = angebotStand(deal, activities, appointments);
  const angebotVorhanden = Boolean(deal.proposal_id || deal.quote_id) || Boolean(stand);
  const datum = (d) => new Date(d).toLocaleDateString('de-AT');

  if (stand) {
    return {
      intent: 'nachfassen', button: 'Nachfassen', dringend: stand.tage >= 7,
      titel: 'Beim Kunden nachfassen',
      grund: `Angebot vom ${datum(stand.gesendet_am)} · seit ${stand.tage} Tagen keine Rückmeldung`,
      stand, angebotVorhanden,
    };
  }
  if (angebotVorhanden) {
    return {
      intent: 'angebot', button: 'Angebot übermitteln', dringend: false,
      titel: `Angebot an ${deal.contact_name || 'den Kunden'} übermitteln`,
      grund: 'Angebot angelegt, noch nicht versendet', stand, angebotVorhanden,
    };
  }
  return {
    intent: 'antwort', button: 'Antwort entwerfen', dringend: false,
    titel: 'Dem Kunden antworten', grund: 'Noch keine ausgehende Nachricht', stand, angebotVorhanden,
  };
}