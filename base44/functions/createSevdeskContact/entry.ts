import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';

// Ausgangsrichtung: Kunde der App in sevDesk anlegen, Kontakt-ID zurückgeben.
// Ist der Kontakt-Ausgang nicht verfügbar, kommt needs_manual zurück —
// der Schritt wird dann von Hand abgeschlossen, es entsteht nie ein stiller Stummel.
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

    // E-Mail als Kommunikationsweg nachtragen — scheitert das, bleibt der Kontakt gültig
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

    return Response.json({ success: true, sevdesk_contact_id: contactId, name: created?.name || name });
  } catch (error) {
    return Response.json({ success: false, needs_manual: true, error: error.message });
  }
}