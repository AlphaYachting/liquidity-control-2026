import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Proxy zur zentralen E-Mail-Datenbank (rico-office.at).
// Aktionen: health | search | threads | thread (lesend), enrich (Auswertung zurückschreiben).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = Deno.env.get('EMAIL_DB_API_TOKEN');
    if (!token) return Response.json({ error: 'EMAIL_DB_API_TOKEN nicht gesetzt' }, { status: 500 });

    const { action, params = {}, thread_id, fields } = await req.json();
    const BASE = 'https://rico-office.at/api';
    const authHeader = { 'Authorization': `Bearer ${token}` };

    if (action === 'enrich') {
      if (!thread_id || !fields) return Response.json({ error: 'thread_id und fields erforderlich' }, { status: 400 });
      const res = await fetch(`${BASE}/enrich_thread`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id, fields }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return Response.json({ error: data?.error || `HTTP ${res.status}` }, { status: res.status });
      return Response.json(data);
    }

    const paths = { health: 'health', search: 'search', threads: 'threads', thread: 'thread' };
    const path = paths[action];
    if (!path) return Response.json({ error: `Unbekannte Aktion: ${action}` }, { status: 400 });

    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v) !== '') qs.set(k, String(v));
    });
    const url = `${BASE}/${path}${qs.toString() ? `?${qs.toString()}` : ''}`;
    const res = await fetch(url, { headers: authHeader });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return Response.json({ error: data?.error || `HTTP ${res.status}` }, { status: res.status });
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});