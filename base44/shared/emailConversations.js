// Schreibt das Ergebnis der Konversationsregel in den Verlaufs-Index (EmailThreadIndex).
// Genutzt vom 15-Minuten-Lauf (syncEmailThreadIndex) und sofort nach jeder
// Erledigt-/Antwort-Aktion aus der App (emailDbApi, Aktion enrich).
import { resolveConversations } from './emailWorkQueue.js';

const PAGE = 500;
const MAX_PAGES = 12;
const CONCURRENCY = 5;

async function loadAll(svc, query) {
  const out = [];
  const seen = new Set();
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await svc.entities.EmailThreadIndex.filter(query, '-last_message_at', PAGE, page * PAGE);
    let neu = 0;
    for (const r of rows || []) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
      neu++;
    }
    if (!rows || rows.length < PAGE || neu === 0) break;
  }
  return out;
}

async function writeChanges(svc, rows, map) {
  const changes = [];
  for (const r of rows) {
    const res = map.get(String(r.thread_id));
    if (!res) continue;
    if (r.needs_reply !== res.needs_reply
      || (r.conversation_key || '') !== res.conversation_key
      || (r.conversation_size || 0) !== res.conversation_size) {
      changes.push({ id: r.id, patch: res });
    }
  }
  for (let i = 0; i < changes.length; i += CONCURRENCY) {
    await Promise.all(changes.slice(i, i + CONCURRENCY).map((c) =>
      svc.entities.EmailThreadIndex.update(c.id, c.patch)));
  }
  return changes.length;
}

const utcString = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

// Alle Verläufe der letzten `days` Tage neu auflösen; ältere verlassen den Posteingang.
export async function recomputeWindow(svc, days = 45) {
  const grenze = utcString(Date.now() - days * 864e5);
  const rows = await loadAll(svc, { last_message_at: { $gte: grenze } });
  const geaendert = await writeChanges(svc, rows, resolveConversations(rows));

  const alt = await loadAll(svc, { needs_reply: true, last_message_at: { $lt: grenze } });
  for (let i = 0; i < alt.length; i += CONCURRENCY) {
    await Promise.all(alt.slice(i, i + CONCURRENCY).map((r) =>
      svc.entities.EmailThreadIndex.update(r.id, { needs_reply: false })));
  }
  const offen = [...resolveConversations(rows).values()].filter((v) => v.needs_reply).length;
  return { geprueft: rows.length, geaendert, ausserhalb_zeitfenster: alt.length, offen };
}

// Nur die Konversation eines Verlaufs neu auflösen (sofort nach einer Aktion in der App).
export async function recomputeConversationOf(svc, row) {
  if (!row?.conversation_key) return 0;
  const rows = await loadAll(svc, { conversation_key: row.conversation_key });
  const merged = rows.map((r) => (r.id === row.id ? { ...r, ...row } : r));
  return writeChanges(svc, merged, resolveConversations(merged));
}
