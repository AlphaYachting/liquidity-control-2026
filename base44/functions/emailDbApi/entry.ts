import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { emailDbGet, emailDbEnrich } from '../../shared/emailDb.ts';

// Proxy zur zentralen E-Mail-Datenbank (rico-office.at).
// Aktionen: health | search | threads | thread (lesend), enrich (Auswertung zurückschreiben).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { action, params = {}, thread_id, fields } = await req.json();

    if (action === 'enrich') {
      if (!thread_id || !fields) return Response.json({ error: 'thread_id und fields erforderlich' }, { status: 400 });
      return Response.json(await emailDbEnrich(thread_id, fields));
    }

    const paths = { health: 'health', search: 'search', threads: 'threads', thread: 'thread' };
    const path = paths[action];
    if (!path) return Response.json({ error: `Unbekannte Aktion: ${action}` }, { status: 400 });
    return Response.json(await emailDbGet(path, params));
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});