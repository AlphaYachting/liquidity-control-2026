// Schreibt das Ergebnis der Konversationsregel in den Verlaufs-Index (EmailThreadIndex).
// Genutzt vom 15-Minuten-Lauf (syncEmailThreadIndex) und sofort nach jeder
// Erledigt-/Antwort-Aktion aus der App (emailDbApi, Aktion enrich).
import { resolveConversations } from './emailWorkQueue.js';

const PAGE = 500;
const MAX_PAGES = 12;
// Die Datenbank der App begrenzt die Schreibrate: kleine Pakete mit Pause, und je Lauf
// höchstens MAX_WRITES Änderungen. Der Rest folgt im nächsten 15-Minuten-Lauf.
const CONCURRENCY = 2;
const PAUSE_MS = 300;
const MAX_WRITES = 200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function updateMitWiederholung(svc, id, patch) {
  for (let versuch = 0; versuch < 4; versuch++) {
    try {
      return await svc.entities.EmailThreadIndex.update(id, patch);
    } catch (e) {
      const gedrosselt = /rate limit|429/i.test(String(e?.message || e));
      if (!gedrosselt || versuch === 3) throw e;
      await sleep(2000 * (versuch + 1));
    }
  }
}

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

async function writeChanges(svc, rows, map, maxWrites = MAX_WRITES) {
  const changes = [];
  for (const r of rows) {
    const res = map.get(String(r.thread_id));
    if (!res) continue;
    const offenGeaendert = Boolean(r.needs_reply) !== res.needs_reply;
    if (offenGeaendert
      || (r.conversation_key || '') !== res.conversation_key
      || (r.conversation_size || 0) !== res.conversation_size) {
      changes.push({ id: r.id, patch: res, prio: offenGeaendert ? 0 : 1 });
    }
  }
  // Was den Posteingang verändert, zuerst
  changes.sort((a, b) => a.prio - b.prio);
  const jetzt = changes.slice(0, maxWrites);
  for (let i = 0; i < jetzt.length; i += CONCURRENCY) {
    await Promise.all(jetzt.slice(i, i + CONCURRENCY).map((c) => updateMitWiederholung(svc, c.id, c.patch)));
    await sleep(PAUSE_MS);
  }
  return { geschrieben: jetzt.length, offen_geblieben: changes.length - jetzt.length };
}

const utcString = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

// Alle Verläufe der letzten `days` Tage neu auflösen; ältere verlassen den Posteingang.
export async function recomputeWindow(svc, days = 45) {
  const grenze = utcString(Date.now() - days * 864e5);
  const rows = await loadAll(svc, { last_message_at: { $gte: grenze } });
  const ergebnis = resolveConversations(rows);
  const geaendert = await writeChanges(svc, rows, ergebnis);

  // Ältere Verläufe verlassen den Posteingang — nur wenn im Lauf noch Schreibbudget ist
  let alt = [];
  const rest = MAX_WRITES - geaendert.geschrieben;
  if (rest > 0) {
    alt = (await loadAll(svc, { needs_reply: true, last_message_at: { $lt: grenze } })).slice(0, rest);
    for (let i = 0; i < alt.length; i += CONCURRENCY) {
      await Promise.all(alt.slice(i, i + CONCURRENCY).map((r) => updateMitWiederholung(svc, r.id, { needs_reply: false })));
      await sleep(PAUSE_MS);
    }
  }
  const offen = [...ergebnis.values()].filter((v) => v.needs_reply).length;
  return { geprueft: rows.length, ...geaendert, ausserhalb_zeitfenster: alt.length, offen };
}

// Nur die Konversation eines Verlaufs neu auflösen (sofort nach einer Aktion in der App).
export async function recomputeConversationOf(svc, row) {
  if (!row?.conversation_key) return 0;
  const rows = await loadAll(svc, { conversation_key: row.conversation_key });
  const merged = rows.map((r) => (r.id === row.id ? { ...r, ...row } : r));
  return (await writeChanges(svc, merged, resolveConversations(merged), 50)).geschrieben;
}
