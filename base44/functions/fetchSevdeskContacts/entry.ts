import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');

// Eingangsrichtung: Kontakte in sevDesk nach Namen suchen — samt Rechnungsadresse,
// damit die Adresse beim Verknüpfen in den Kunden der App übernommen werden kann.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ error: 'SEVDESK_API_KEY nicht gesetzt', contacts: [] }, { status: 200 });

    const body = await req.json().catch(() => ({}));
    const raw = String(body.query || '').trim();
    const q = norm(raw);
    if (!q) return Response.json({ success: true, contacts: [] });

    const headers = { Authorization: apiKey, 'Content-Type': 'application/json' };

    // Suche serverseitig — der Kontaktbestand ist zu groß, um vollständig geladen zu werden
    const res = await fetch(`${SEVDESK_BASE}/Contact?depth=1&limit=50&name=${encodeURIComponent(raw)}`, { headers });
    if (!res.ok) {
      return Response.json({ success: false, api_available: false, error: `sevDesk ${res.status}`, contacts: [] });
    }
    const data = await res.json();
    const contacts = (data.objects || [])
      .map((c) => ({
        sevdesk_contact_id: String(c.id),
        name: c.name || [c.surename, c.familyname].filter(Boolean).join(' ') || '',
        customer_number: c.customerNumber || '',
      }))
      .filter((c) => c.name)
      .slice(0, 10);

    // Adressen nur für die angezeigten Treffer nachladen
    await Promise.all(contacts.map(async (c) => {
      const r = await fetch(
        `${SEVDESK_BASE}/ContactAddress?depth=1&limit=1&contact[id]=${c.sevdesk_contact_id}&contact[objectName]=Contact`,
        { headers },
      ).catch(() => null);
      if (!r || !r.ok) return;
      const a = (await r.json())?.objects?.[0];
      if (!a) return;
      c.street = a.street || '';
      c.zip = a.zip || '';
      c.city = a.city || '';
      c.country_code = a.country?.code ? String(a.country.code).toUpperCase() : '';
    }));

    return Response.json({ success: true, api_available: true, contacts });
  } catch (error) {
    return Response.json({ success: false, api_available: false, error: error.message, contacts: [] });
  }
}