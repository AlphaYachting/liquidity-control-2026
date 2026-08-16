import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');

// Eingangsrichtung: Kontakte in sevDesk nach Namen suchen
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ error: 'SEVDESK_API_KEY nicht gesetzt', contacts: [] }, { status: 200 });

    const body = await req.json().catch(() => ({}));
    const q = norm(body.query);
    if (!q) return Response.json({ success: true, contacts: [] });

    const res = await fetch(`${SEVDESK_BASE}/Contact?depth=1&limit=1000&offset=0`, {
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    });
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
      .filter((c) => norm(c.name).length >= 3 && (norm(c.name).includes(q) || q.includes(norm(c.name))))
      .slice(0, 20);

    return Response.json({ success: true, api_available: true, contacts });
  } catch (error) {
    return Response.json({ success: false, api_available: false, error: error.message, contacts: [] });
  }
}