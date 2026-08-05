import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { emailDbGet } from '../../shared/emailDb.ts';
import { computeNeedsReply } from '../../shared/emailWorkQueue.js';

// Die zentrale E-Mail-Datenbank liefert höchstens 100 Verläufe pro Abfrage und
// kennt keine Blätterfunktion — alles Ältere ist über die API unerreichbar.
// Darum führt die App einen eigenen Verlaufs-Index:
//   • "fenster"  : das laufende Zeitfenster mitschreiben (nichts rutscht mehr heraus)
//   • "nachlauf" : die Historie abwärts über die Verlaufs-IDs nachholen
// Der Index ist danach die Quelle der Arbeitsliste "Braucht Antwort".

const CONCURRENCY = 6;

async function mapLimited(items, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    out.push(...await Promise.all(items.slice(i, i + CONCURRENCY).map(fn)));
  }
  return out;
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
    last_to: last?.to || (last?.direction === 'in' ? (lastOut?.from || '') : (lastIn?.from || '')),
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
  const patch = { ...row, thread_id: String(threadId), source, indexed_at: new Date().toISOString() };
  patch.needs_reply = computeNeedsReply(patch);
  const prev = existing.get(String(threadId));
  if (prev) {
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
    if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'both';
    const detailLimit = body.detail_limit ?? 40;
    const backfillBatch = body.backfill_batch ?? 60;

    const stats = { fenster_geprueft: 0, neu: 0, aktualisiert: 0, details_geladen: 0, nachlauf_ids: 0, nachlauf_gefunden: 0, fehler: [] };

    const stateRows = await svc.entities.EmailIndexState.list('-created_date', 1);
    const state = stateRows[0] || await svc.entities.EmailIndexState.create({ indexed_total: 0 });
    let maxThreadId = state.max_thread_id || 0;

    // ---------- Phase 1: laufendes Fenster ----------
    if (mode === 'window' || mode === 'both') {
      const seen = new Map();
      for (const params of [{ limit: 100 }, { limit: 100, status: 'offen' }]) {
        try {
          const listing = await emailDbGet('threads', params);
          (listing.results || []).forEach((t) => { if (!seen.has(t.id)) seen.set(t.id, t); });
        } catch (e) { stats.fehler.push(`Fenster (${JSON.stringify(params)}): ${e.message}`); }
      }
      const threads = [...seen.values()];
      stats.fenster_geprueft = threads.length;
      threads.forEach((t) => { if (Number(t.id) > maxThreadId) maxThreadId = Number(t.id); });

      const existing = await loadExisting(svc, threads.map((t) => t.id));
      // Nur Verläufe mit neuen Nachrichten (oder ohne gelesenes Detail) brauchen einen Detailabruf.
      const needDetail = threads.filter((t) => {
        const prev = existing.get(String(t.id));
        return !prev || !prev.detail_loaded || prev.last_message_at !== (t.last_message_at || '') ||
          (prev.message_count || 0) !== (t.message_count || 0);
      }).slice(0, detailLimit);
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
            // Stammdaten frisch übernehmen, Antwortstand aus dem Index behalten
            row = {
              ...rowFromDetail(t, []),
              last_direction: prev?.last_direction || '',
              last_from: prev?.last_from || '',
              last_from_name: prev?.last_from_name || '',
              last_to: prev?.last_to || '',
              last_inbound_from: prev?.last_inbound_from || '',
              has_outbound: prev?.has_outbound || false,
              detail_loaded: prev?.detail_loaded || false,
            };
          }
          const res = await upsert(svc, existing, t.id, row, 'fenster');
          stats[res === 'neu' ? 'neu' : 'aktualisiert']++;
        } catch (e) { stats.fehler.push(`Verlauf ${t.id}: ${e.message}`); }
      });
    }

    // ---------- Phase 2: historischer Nachlauf über die IDs ----------
    if ((mode === 'backfill' || mode === 'both') && !state.backfill_done) {
      let cursor = state.backfill_cursor || (maxThreadId ? maxThreadId - 1 : 0);
      if (cursor > 0) {
        const ids = [];
        for (let i = 0; i < backfillBatch && cursor - i > 0; i++) ids.push(cursor - i);
        stats.nachlauf_ids = ids.length;
        const existing = await loadExisting(svc, ids);
        await mapLimited(ids, async (id) => {
          const prev = existing.get(String(id));
          if (prev && prev.detail_loaded) return;
          try {
            const detail = await emailDbGet('thread', { id, msgs: 12 });
            if (!detail?.thread?.id) return;
            const res = await upsert(svc, existing, id, rowFromDetail(detail.thread, detail.messages), 'nachlauf');
            stats.nachlauf_gefunden++;
            stats[res === 'neu' ? 'neu' : 'aktualisiert']++;
          } catch (_e) { /* nicht existierende ID ist normal */ }
        });
        cursor = Math.max(0, cursor - ids.length);
      }
      await svc.entities.EmailIndexState.update(state.id, {
        backfill_cursor: cursor,
        backfill_done: cursor <= 0,
        last_backfill_run_at: new Date().toISOString(),
        max_thread_id: maxThreadId,
      });
    }

    await svc.entities.EmailIndexState.update(state.id, {
      max_thread_id: maxThreadId,
      last_window_run_at: new Date().toISOString(),
    });

    return Response.json({ ok: true, ...stats });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}