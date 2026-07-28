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

    // Thread-Liste optional mit letzter Nachricht anreichern (wer hat zuletzt geschrieben?)
    if (action === 'threads' && params.with_reply_state) {
      const { with_reply_state: _drop, ...listParams } = params;
      const listing = await emailDbGet('threads', listParams);
      const results = listing.results || [];
      for (let i = 0; i < results.length; i += 10) {
        await Promise.all(results.slice(i, i + 10).map(async (t: any) => {
          try {
            const detail = await emailDbGet('thread', { id: t.id, msgs: 6 });
            const msgs = detail.messages || [];
            const last = msgs[0];
            // Letzter Kunden-Absender (für Kundenableitung aus der Domain im Frontend)
            const lastIn = msgs.find((m: any) => m.direction === 'in');
            if (lastIn) t.last_inbound_from = lastIn.from || '';
            if (last) {
              t.last_from = last.from || '';
              t.last_from_name = last.from_name || '';
              t.last_direction = last.direction || '';
              // Empfänger ableiten: die DB liefert kein "to"-Feld —
              // eingehend => unser Kollege im Thread (letzter ausgehender Absender),
              // ausgehend => der Kunde (letzter eingehender Absender)
              const lastOut = msgs.find((m: any) => m.direction === 'out');
              t.last_to = last.to || (last.direction === 'in' ? (lastOut?.from || '') : (lastIn?.from || ''));
            }
          } catch (_e) { /* Anreicherung optional */ }
        }));
      }
      return Response.json(listing);
    }

    return Response.json(await emailDbGet(path, params));
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});