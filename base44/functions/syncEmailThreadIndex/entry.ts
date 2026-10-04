import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { emailDbGet } from '../../shared/emailDb.ts';
import { recomputeWindow } from '../../shared/emailConversations.js';

// Die E-Mail-Datenbank kann seit API v2 seitenweise blättern (limit/offset,
// has_more, next_offset). Der Verlaufs-Index wird daher direkt über die
// Verlaufsliste aufgebaut — kein Raten über Verlaufs-IDs mehr:
//   • "fenster"  : die jüngsten Seiten mitschreiben (laufende Aktualisierung)
//   • "nachlauf" : ab dem gespeicherten Offset weiter in die Historie blättern
// Der Index ist die Quelle der Arbeitsliste "Braucht Antwort".

// Die E-Mail-Datenbank begrenzt die Zugriffsrate — kleine Pakete mit Pause,
// sonst bricht der Lauf mit "Rate limit exceeded" ab (Ursache der Ausfälle).
const CONCURRENCY = 3;
const PAUSE_MS = 250;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mapLimited(items, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    out.push(...await Promise.all(items.slice(i, i + CONCURRENCY).map(fn)));
    if (i + CONCURRENCY < items.length) await sleep(PAUSE_MS);
  }
  return out;
}

// Die E-Mail-Datenbank liefert Empfänger (to) als Liste. Das Index-Feld last_to
// ist ein Textfeld — eine Liste dort ließ das Speichern genau der Verläufe
// scheitern, deren Details geladen wurden (Antwortstand fehlte dadurch).
function alsText(wert) {
  if (wert === null || wert === undefined) return '';
  if (Array.isArray(wert)) {
    return wert
      .map((x) => (typeof x === 'string' ? x : (x?.email || x?.address || '')))
      .filter(Boolean)
      .join(', ');
  }
  if (typeof wert === 'object') return String(wert.email || wert.address || '');
  return String(wert);
}

function rowFromDetail(meta, messages) {
  const msgs = messages || [];
  const last = msgs[0];
  const lastIn = msgs.find((m) => m.direction === 'in');
  const lastOut = msgs.find((m) => m.direction === 'out');
  return {
    subject: meta.subject || '',
    customer: meta.customer || '',
    category: meta.category || '',
    status: meta.status || '',
    crm_status: meta.crm_status || '',
    first_message_at: meta.first_message_at || '',
    last_message_at: meta.last_message_at || last?.received_at || '',
    message_count: meta.message_count || msgs.length || 0,
    last_direction: last?.direction || '',
    last_from: last?.from || '',
    last_from_name: last?.from_name || '',
    last_to: alsText(last?.to) || (last?.direction === 'in' ? (lastOut?.from || '') : (lastIn?.from || '')),
    last_inbound_from: lastIn?.from || '',
    has_outbound: msgs.some((m) => m.direction === 'out'),
    detail_loaded: msgs.length > 0,
  };
}

async function loadExisting(svc, ids) {
  if (!ids.length) return new Map();
  const rows = await svc.entities.EmailThreadIndex.filter({ thread_id: { $in: ids.map(String) } }, '-last_message_at', 500);
  return new Map(rows.map((r) => [String(r.thread_id), r]));
}

async function upsert(svc, existing, threadId, row, source) {
  // needs_reply wird NICHT hier gesetzt, sondern in Phase 3 auf Konversationsebene.
  const patch = { ...row, thread_id: String(threadId), source, indexed_at: new Date().toISOString() };
  const prev = existing.get(String(threadId));
  if (prev) {
    const gleich = Object.keys(patch)
      .filter((k) => k !== 'indexed_at' && k !== 'source')
      .every((k) => JSON.stringify(patch[k] ?? null) === JSON.stringify(prev[k] ?? null));
    if (gleich) return 'unverändert';
    await svc.entities.EmailThreadIndex.update(prev.id, patch);
    return 'aktualisiert';
  }
  await svc.entities.EmailThreadIndex.create(patch);
  return 'neu';
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'both';
    const detailLimit = body.detail_limit ?? 12;
    const pageSize = body.page_size ?? 100;
    const backfillPages = body.backfill_pages ?? 1;

    const stats: any = { fenster_geprueft: 0, neu: 0, aktualisiert: 0, unveraendert: 0, details_geladen: 0, nachlauf_geprueft: 0, gesamt_verlaeufe: 0, fehler: [] };

    const stateRows = await svc.entities.EmailIndexState.list('-created_date', 1);
    const state = stateRows[0] || await svc.entities.EmailIndexState.create({ indexed_total: 0 });
    let maxThreadId = state.max_thread_id || 0;

    // Eine Seite der Verlaufsliste in den Index übernehmen
    const indexPage = async (threads, source, detailBudget) => {
      threads.forEach((t) => { if (Number(t.id) > maxThreadId) maxThreadId = Number(t.id); });
      const existing = await loadExisting(svc, threads.map((t) => t.id));
      // Nur Verläufe mit neuen Nachrichten (oder ohne gelesenes Detail) brauchen einen Detailabruf.
      const needDetail = threads.filter((t) => {
        const prev = existing.get(String(t.id));
        return !prev || !prev.detail_loaded || prev.last_message_at !== (t.last_message_at || '') ||
          (prev.message_count || 0) !== (t.message_count || 0);
      }).slice(0, detailBudget);
      const detailIds = new Set(needDetail.map((t) => String(t.id)));

      await mapLimited(threads, async (t) => {
        try {
          let row;
          if (detailIds.has(String(t.id))) {
            const detail = await emailDbGet('thread', { id: t.id, msgs: 12 });
            row = rowFromDetail({ ...t, ...(detail.thread || {}) }, detail.messages);
            stats.details_geladen++;
          } else {
            const prev = existing.get(String(t.id));
            // Hat der Verlauf seit dem letzten Detailabruf eine neue Nachricht, ist der
            // gespeicherte Antwortstand veraltet: dann NICHT als geladen markieren, damit
            // er in einem der nächsten Läufe mit Details nachgeladen wird.
            const unveraendertSeitDetail = !!prev?.detail_loaded
              && String(prev.last_message_at || '') === String(t.last_message_at || '')
              && (prev.message_count || 0) === (t.message_count || 0);
            // Stammdaten frisch übernehmen, Antwortstand aus dem Index behalten
            row = {
              ...rowFromDetail(t, []),
              last_direction: prev?.last_direction || '',
              last_from: prev?.last_from || '',
              last_from_name: prev?.last_from_name || '',
              last_to: prev?.last_to || '',
              last_inbound_from: prev?.last_inbound_from || '',
              has_outbound: prev?.has_outbound || false,
              detail_loaded: unveraendertSeitDetail,
            };
          }
          const res = await upsert(svc, existing, t.id, row, source);
          stats[res === 'neu' ? 'neu' : res === 'unverändert' ? 'unveraendert' : 'aktualisiert']++;
        } catch (e) {
          // Sichtbar protokollieren — bisher wurden Speicherfehler stillschweigend verschluckt.
          console.error(`syncEmailThreadIndex: Verlauf ${t.id} nicht gespeichert: ${e.message}`);
          stats.fehler.push(`Verlauf ${t.id}: ${e.message}`);
        }
      });
    };

    // ---------- Phase 1: laufendes Fenster (jüngste Seite) ----------
    if (mode === 'window' || mode === 'both') {
      try {
        const listing = await emailDbGet('threads', { limit: pageSize, offset: 0 });
        const threads = listing.results || [];
        stats.fenster_geprueft = threads.length;
        stats.gesamt_verlaeufe = listing.total || 0;
        await indexPage(threads, 'fenster', detailLimit);
      } catch (e) { stats.fehler.push(`Fenster: ${e.message}`); }
    }

    // ---------- Phase 2: Historie weiterblättern ----------
    if ((mode === 'backfill' || mode === 'both') && !state.backfill_done) {
      let offset = state.backfill_cursor || pageSize;
      let done = false;
      // Der Nachlauf muss nicht die gesamte Historie erfassen — die Arbeitsliste
      // blickt maximal ein Jahr zurück. Sobald eine Seite nur noch Ältere enthält,
      // ist das Verzeichnis vollständig.
      const grenze = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
      for (let page = 0; page < backfillPages && !done; page++) {
        try {
          const listing = await emailDbGet('threads', { limit: pageSize, offset });
          const threads = listing.results || [];
          stats.nachlauf_geprueft += threads.length;
          if (listing.total) stats.gesamt_verlaeufe = listing.total;
          const zuAlt = threads.length > 0 && threads.every((t) => String(t.last_message_at || '') < grenze);
          if (!zuAlt) await indexPage(threads, 'nachlauf', detailLimit);
          if (zuAlt) {
            done = true;
          } else if (listing.has_more && threads.length) {
            offset = listing.next_offset ?? offset + threads.length;
          } else {
            done = true;
          }
        } catch (e) { stats.fehler.push(`Nachlauf (offset ${offset}): ${e.message}`); break; }
      }
      await svc.entities.EmailIndexState.update(state.id, {
        backfill_cursor: offset,
        backfill_done: done,
        last_backfill_run_at: new Date().toISOString(),
        max_thread_id: maxThreadId,
      });
    }

    // ---------- Phase 3: Konversationen auflösen (Quelle des Posteingangs) ----------
    try {
      stats.konversationen = await recomputeWindow(svc, body.window_days ?? 45);
    } catch (e) { stats.fehler.push(`Konversationen: ${e.message}`); }

    try {
      await svc.entities.EmailIndexState.update(state.id, {
        max_thread_id: maxThreadId,
        last_window_run_at: new Date().toISOString(),
      });
    } catch (e) { stats.fehler.push(`Status: ${e.message}`); }

    if (stats.fehler.length) {
      console.error(`syncEmailThreadIndex: ${stats.fehler.length} Fehler in diesem Lauf`);
    }
    return Response.json({ ok: true, ...stats });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}