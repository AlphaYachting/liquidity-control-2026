import { base44 } from '@/api/base44Client';

// Zwischenspeicher des gefilterten Index. Der Schlüssel trägt die E-Mail-
// Adresse: zwei Personen an einem Rechner sehen NICHT denselben Index.
const GRENZE = 2 * 1024 * 1024;
const DB = 'am-search';
const STORE = 'index';

const schluessel = (email, version) => `am.search.${email}.${version}`;

function idb() {
  return new Promise((ok, fehl) => {
    const anfrage = indexedDB.open(DB, 1);
    anfrage.onupgradeneeded = () => anfrage.result.createObjectStore(STORE);
    anfrage.onsuccess = () => ok(anfrage.result);
    anfrage.onerror = () => fehl(anfrage.error);
  });
}

async function idbLesen(key) {
  const db = await idb();
  return new Promise((ok) => {
    const t = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    t.onsuccess = () => ok(t.result || null);
    t.onerror = () => ok(null);
  });
}

async function idbSchreiben(key, wert) {
  const db = await idb();
  return new Promise((ok) => {
    const t = db.transaction(STORE, 'readwrite').objectStore(STORE).put(wert, key);
    t.onsuccess = () => ok(true);
    t.onerror = () => ok(false);
  });
}

async function lesen(key) {
  const roh = localStorage.getItem(key);
  if (roh) {
    try { return JSON.parse(roh); } catch (e) { /* beschädigt — neu holen */ }
  }
  try { return await idbLesen(key); } catch (e) { return null; }
}

async function schreiben(key, daten) {
  const roh = JSON.stringify(daten);
  if (roh.length < GRENZE) {
    try { localStorage.setItem(key, roh); return; } catch (e) { /* voll — IndexedDB */ }
  }
  try { await idbSchreiben(key, daten); } catch (e) { /* ohne Zwischenspeicher weiter */ }
}

function einpflegen(alt, neu, entfernt) {
  const nachId = new Map(alt.map((z) => [z.id, z]));
  neu.forEach((z) => nachId.set(z.id, z));
  (entfernt || []).forEach((id) => nachId.delete(id));
  return Array.from(nachId.values());
}

// Liefert sofort den vorhandenen Stand und frischt im Hintergrund auf.
export async function ladeIndex(email, onFrisch) {
  const version = Number(localStorage.getItem(`am.search.version.${email}`)) || 0;
  const cache = version ? await lesen(schluessel(email, version)) : null;

  const holen = async (since) => {
    const res = await base44.functions.invoke('getSearchIndex', since ? { since } : {});
    return res.data;
  };

  if (cache?.zeilen?.length) {
    holen(cache.stand).then(async (d) => {
      if (!d || d.error) return;
      const zeilen = d.version === version
        ? einpflegen(cache.zeilen, d.zeilen, d.entfernt)
        : (await holen(null)).zeilen;
      const stand = d.stand;
      localStorage.setItem(`am.search.version.${email}`, String(d.version));
      await schreiben(schluessel(email, d.version), { zeilen, stand });
      onFrisch?.(zeilen);
    }).catch(() => {});
    return cache.zeilen;
  }

  const d = await holen(null);
  if (!d || d.error) return [];
  localStorage.setItem(`am.search.version.${email}`, String(d.version));
  await schreiben(schluessel(email, d.version), { zeilen: d.zeilen, stand: d.stand });
  return d.zeilen;
}

// Zuletzt geöffnete Ziele — fünf Stück, für das leere Feld.
const ZULETZT = 'am.search.zuletzt';

export function zuletztGeoeffnet() {
  try { return JSON.parse(localStorage.getItem(ZULETZT) || '[]'); } catch (e) { return []; }
}

export function merkeGeoeffnet(zeile) {
  const liste = zuletztGeoeffnet().filter((z) => z.route !== zeile.route);
  liste.unshift({
    entry_type: zeile.entry_type,
    title: zeile.title,
    subtitle: zeile.subtitle,
    route: zeile.route,
  });
  localStorage.setItem(ZULETZT, JSON.stringify(liste.slice(0, 5)));
}