import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { emailDbGet, emailDbEnrich } from '../../shared/emailDb.ts';

// "AW: Re: Fwd: Feedback" -> "feedback" (gleiche Logik wie im Frontend-Grouping)
function normalizeSubject(s: string) {
  let out = String(s || '').toLowerCase().trim();
  let prev;
  do {
    prev = out;
    out = out.replace(/^\s*(re|aw|fw|fwd|wg|antw|antwort)\s*(\[\d+\])?\s*:\s*/i, '');
    out = out.replace(/^\s*\[external\]\s*/i, '');
  } while (out !== prev);
  return out.trim();
}

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

      // Threads ohne KI-Auswertung haben KEINEN Status und fallen daher aus jeder
      // status-gefilterten Abfrage heraus — sie wären dauerhaft unsichtbar.
      // Darum das ungefilterte Fenster dazuholen und die unbewerteten ergänzen.
      if (listParams.status) {
        try {
          const { status: _s, ...openParams } = listParams;
          const fresh = await emailDbGet('threads', openParams);
          const known = new Set(results.map((t: any) => t.id));
          (fresh.results || []).forEach((t: any) => {
            if (!t.status && !known.has(t.id)) {
              known.add(t.id);
              results.push({ ...t, unevaluated: true });
            }
          });
          listing.results = results;
        } catch (_e) { /* Ergänzung ist Best-Effort */ }
      }
      for (let i = 0; i < results.length; i += 6) {
        await Promise.all(results.slice(i, i + 6).map(async (t: any) => {
          try {
            let detail;
            try {
              detail = await emailDbGet('thread', { id: t.id, msgs: 12 });
            } catch (_first) {
              // ein Fehlschlag darf den Thread nicht unsichtbar machen -> einmal erneut versuchen
              await new Promise((r) => setTimeout(r, 300));
              detail = await emailDbGet('thread', { id: t.id, msgs: 12 });
            }
            const msgs = detail.messages || [];
            const last = msgs[0];
            // Letzter Kunden-Absender (für Kundenableitung aus der Domain im Frontend)
            const lastIn = msgs.find((m: any) => m.direction === 'in');
            if (lastIn) t.last_inbound_from = lastIn.from || '';
            // Haben WIR in diesem Verlauf jemals geschrieben? Wichtigstes Relevanz-Signal
            // (echte Geschäftskonversation vs. Spam/Newsletter, den niemand beantwortet hat)
            t.has_outbound = msgs.some((m: any) => m.direction === 'out');
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
          } catch (_e) {
            // Anreicherung endgültig fehlgeschlagen -> kennzeichnen, damit das Frontend
            // auf die Thread-Basisdaten zurückfallen kann statt den Thread zu verwerfen
            t.enrich_failed = true;
          }
        }));
      }
      return Response.json(listing);
    }

    // Thread-Detail: zusammengehörige Geschwister-Threads (gleicher normalisierter Betreff)
    // finden und deren Nachrichten in EINE Konversation zusammenführen.
    if (action === 'thread') {
      const detail = await emailDbGet('thread', params);
      const subj = normalizeSubject(detail?.thread?.subject);
      if (subj.length >= 6) {
        try {
          const search = await emailDbGet('search', { q: subj, limit: 30 });
          const siblingIds = [...new Set((search.results || [])
            .filter((r: any) => r.thread_id && r.thread_id !== detail.thread.id && normalizeSubject(r.subject) === subj)
            .map((r: any) => r.thread_id))].slice(0, 5);
          if (siblingIds.length) {
            detail.messages = detail.messages || [];
            const seen = new Set(detail.messages.map((m: any) => m.id));
            const related: any[] = [];
            for (const sid of siblingIds) {
              try {
                const sib = await emailDbGet('thread', { id: sid, msgs: params.msgs || 15, full: params.full });
                related.push({
                  id: sid,
                  subject: sib.thread?.subject,
                  message_count: sib.thread?.message_count,
                  last_message_at: sib.thread?.last_message_at,
                });
                (sib.messages || []).forEach((m: any) => {
                  if (!seen.has(m.id)) { seen.add(m.id); detail.messages.push(m); }
                });
              } catch (_e) { /* einzelner Geschwister-Thread darf das Detail nicht brechen */ }
            }
            // neueste zuerst (Frontend verlässt sich darauf)
            detail.messages.sort((a: any, b: any) => String(b.received_at || '').localeCompare(String(a.received_at || '')));
            detail.related_threads = related;
          }
        } catch (_e) { /* Zusammenführung ist Best-Effort — Basisdetail immer liefern */ }
      }
      return Response.json(detail);
    }

    return Response.json(await emailDbGet(path, params));
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});