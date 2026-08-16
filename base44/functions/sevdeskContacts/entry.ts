import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ error: 'SEVDESK_API_KEY not set' }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'search';
    const headers = { Authorization: apiKey, 'Content-Type': 'application/json' };

    if (action === 'search') {
      const q = norm(body.query);
      const res = await fetch(`${SEVDESK_BASE}/Contact?depth=1&limit=1000&offset=0`, { headers });
      if (!res.ok) throw new Error(`sevDesk ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const all = (data.objects || []).map((c) => ({
        id: String(c.id),
        name: c.name || [c.surename, c.familyname].filter(Boolean).join(' ') || `Kontakt ${c.id}`,
        customer_number: c.customerNumber || '',
      }));
      const contacts = q
        ? all.filter((c) => norm(c.name).length >= 3 && (norm(c.name).includes(q) || q.includes(norm(c.name)))).slice(0, 20)
        : [];
      return Response.json({ success: true, contacts });
    }

    if (action === 'create') {
      const name = String(body.name || '').trim();
      if (!name) return Response.json({ error: 'name fehlt' }, { status: 400 });
      const res = await fetch(`${SEVDESK_BASE}/Contact`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name,
          category: { id: 3, objectName: 'Category' },
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`sevDesk ${res.status}: ${text}`);
      const created = JSON.parse(text)?.objects;
      return Response.json({
        success: true,
        contact: { id: String(created?.id || ''), name: created?.name || name },
      });
    }

    return Response.json({ error: `Unbekannte Aktion: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}