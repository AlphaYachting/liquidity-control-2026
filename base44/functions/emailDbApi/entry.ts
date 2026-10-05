import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { emailDbGet, emailDbEnrich } from '../../shared/emailDb.ts';
import { computeNeedsReply, conversationKeyOf } from '../../shared/emailWorkQueue.js';
import { recomputeConversationOf } from '../../shared/emailConversations.js';
import { vertraulichGrund, teilnehmerAusNachrichten } from '../../shared/vertraulich.js';

const VERTRAULICH_TEXT = 'Diese Konversation ist vertraulich und wird in der App nicht angezeigt.';

// Listen (threads, search) um vertrauliche Konversationen bereinigen. Teilnehmer kommen aus dem
// Listeneintrag selbst, aus dem Verlaufs-Index (letzter Absender/Empfänger) und — falls schon
// geladen — aus den Nachrichten (__teilnehmer).
async function bereinigeListe(svc: any, results: any[], regeln: any[], istAdmin: boolean) {
  if (!Array.isArray(results) || !results.length) return results || [];
  const ids = [...new Set(results.map((r: any) => String(r.thread_id || r.id || '')).filter(Boolean))];
  let index: any[] = [];
  try {
    for (let i = 0; i < ids.length; i += 100) {
      index.push(...await svc.entities.EmailThreadIndex.filter({ thread_id: { $in: ids.slice(i, i + 100) } }, '-last_message_at', 200));
    }
  } catch (_e) { index = []; }
  const nachId = new Map(index.map((z: any) => [String(z.thread_id), z]));
  return results.filter((r: any) => {
    const z = nachId.get(String(r.thread_id || r.id || '')) || {};
    const t = r.__teilnehmer || { absender: [], empfaenger: [] };
    const grund = vertraulichGrund({
      absender: [r.from, r.sender, r.last_from, r.last_inbound_from, z.last_from, z.last_inbound_from, t.absender],
      empfaenger: [r.to, r.cc, r.last_to, z.last_to, t.empfaenger],
      regeln,
      istAdmin,
    });
    delete r.__teilnehmer;
    return !grund;
  });
}

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
      const result = await emailDbEnrich(thread_id, fields);
      // Verlaufs-Index sofort nachziehen: Jede Erledigt-, Antwort-, Lead- oder
      // Ticket-Aktion aus der App setzt done_at. Das gilt bis zur nächsten
      // Kundennachricht — danach kehrt die Konversation in den Posteingang zurück.
      try {
        const svc = base44.asServiceRole;
        const rows = await svc.entities.EmailThreadIndex.filter({ thread_id: String(thread_id) }, '-indexed_at', 1);
        if (rows[0]) {
          const patch: any = { indexed_at: new Date().toISOString() };
          if (fields.status !== undefined) patch.status = fields.status || '';
          if (fields.category !== undefined) patch.category = fields.category || '';
          if (fields.customer !== undefined) patch.customer = fields.customer || '';
          if (fields.crm_status !== undefined) patch.crm_status = fields.crm_status || '';
          if (fields.status !== undefined) {
            patch.done_at = fields.status && fields.status !== 'offen' ? new Date().toISOString() : '';
          } else if (fields.crm_status) {
            patch.done_at = new Date().toISOString();
          }
          const merged = { ...rows[0], ...patch };
          if (!merged.conversation_key) patch.conversation_key = conversationKeyOf(merged);
          patch.needs_reply = computeNeedsReply(merged);
          await svc.entities.EmailThreadIndex.update(rows[0].id, patch);
          // Geschwister-Verläufe derselben Konversation sofort mitziehen
          await recomputeConversationOf(svc, { ...merged, ...patch });
        }
      } catch (_e) { /* Index-Nachzug ist Best-Effort */ }
      return Response.json(result);
    }

    const paths = { health: 'health', search: 'search', threads: 'threads', thread: 'thread' };
    const path = paths[action];
    if (!path) return Response.json({ error: `Unbekannte Aktion: ${action}` }, { status: 400 });

    // Vertrauliche Post (Masseverwalter, Verwaltung, Mails nur an den GF) — Regeln einmal je Aufruf laden
    const svcRole = base44.asServiceRole;
    const istAdmin = user.role === 'admin';
    const regeln = action === 'health' ? [] : await svcRole.entities.InboxBlockedSender.list('-created_date', 200).catch(() => []);

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
            t.__teilnehmer = teilnehmerAusNachrichten(msgs);
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
      listing.results = await bereinigeListe(svcRole, listing.results || [], regeln, istAdmin);
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
      // Vertraulich? Dann gar nichts ausliefern — auch nicht Betreff oder Teilnehmer.
      const tid = String(detail?.thread?.id || params.id || '');
      const zeile = tid
        ? (await svcRole.entities.EmailThreadIndex.filter({ thread_id: tid }, '-last_message_at', 1).catch(() => []))[0] || {}
        : {};
      const teil = teilnehmerAusNachrichten(detail?.messages || []);
      const grund = vertraulichGrund({
        absender: [teil.absender, detail?.thread?.from, zeile.last_from, zeile.last_inbound_from],
        empfaenger: [teil.empfaenger, detail?.thread?.to, zeile.last_to],
        regeln,
        istAdmin,
      });
      if (grund) return Response.json({ error: VERTRAULICH_TEXT, vertraulich: grund }, { status: 403 });
      return Response.json(detail);
    }

    const daten = await emailDbGet(path, params);
    if ((action === 'threads' || action === 'search') && Array.isArray(daten?.results)) {
      daten.results = await bereinigeListe(svcRole, daten.results, regeln, istAdmin);
    }
    return Response.json(daten);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
