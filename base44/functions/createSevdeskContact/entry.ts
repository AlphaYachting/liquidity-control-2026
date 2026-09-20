import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';

// Ausgangsrichtung: Kunde der App in sevDesk anlegen, Kontakt-ID zurückgeben.
// Adresse und E-Mail werden mitgeschrieben. Ist der Kontakt-Ausgang nicht
// verfügbar, kommt needs_manual zurück — es entsteht nie ein stiller Stummel.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    if (!name) return Response.json({ error: 'name fehlt' }, { status: 400 });

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) {
      return Response.json({ success: false, needs_manual: true, error: 'SEVDESK_API_KEY nicht gesetzt' });
    }
    const headers = { Authorization: apiKey, 'Content-Type': 'application/json' };

    const res = await fetch(`${SEVDESK_BASE}/Contact`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, category: { id: 3, objectName: 'Category' } }),
    });
    const text = await res.text();
    if (!res.ok) {
      return Response.json({ success: false, needs_manual: true, error: `sevDesk ${res.status}: ${text.slice(0, 300)}` });
    }
    const created = JSON.parse(text)?.objects;
    const contactId = String(created?.id || '');
    if (!contactId) {
      return Response.json({ success: false, needs_manual: true, error: 'sevDesk hat keine Kontakt-ID geliefert' });
    }

    // Rechnungsadresse nachtragen — scheitert das, bleibt der Kontakt gültig
    const street = String(body.street || '').trim();
    const city = String(body.city || '').trim();
    let addressWarning = '';
    if (street || city) {
      const code = String(body.country_code || 'AT').trim().toUpperCase();
      const landRes = await fetch(`${SEVDESK_BASE}/StaticCountry?code=${encodeURIComponent(code)}`, { headers }).catch(() => null);
      const landId = landRes && landRes.ok ? (await landRes.json())?.objects?.[0]?.id : null;
      const addrRes = await fetch(`${SEVDESK_BASE}/ContactAddress`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contact: { id: contactId, objectName: 'Contact' },
          street,
          zip: String(body.zip || '').trim(),
          city,
          ...(landId ? { country: { id: landId, objectName: 'StaticCountry' } } : {}),
          category: { id: 47, objectName: 'Category' },
        }),
      }).catch(() => null);
      if (!addrRes || !addrRes.ok) addressWarning = 'Adresse konnte in sevDesk nicht gespeichert werden';
    }

    // E-Mail als Kommunikationsweg nachtragen
    const email = String(body.contact_email || '').trim();
    if (email && email !== 'unbekannt@example.com') {
      await fetch(`${SEVDESK_BASE}/CommunicationWay`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contact: { id: contactId, objectName: 'Contact' },
          type: 'EMAIL',
          value: email,
          key: { id: 1, objectName: 'CommunicationWayKey' },
        }),
      }).catch(() => null);
    }

    return Response.json({
      success: true,
      sevdesk_contact_id: contactId,
      name: created?.name || name,
      address_warning: addressWarning,
    });
  } catch (error) {
    return Response.json({ success: false, needs_manual: true, error: error.message });
  }
}