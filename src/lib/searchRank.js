import { normalize } from '@/lib/searchNormalize';

// Bewertung gegen die normalisierte Eingabe — synchron über das Array im
// Speicher, ohne Netzaufruf und ohne Entprellung.
//
// Mehrwortsuche: jedes Wort muss irgendwo vorkommen, Reihenfolge egal.
// Einzelwortsuche verhält sich wie bisher.
function wortPunkte(h, woerter, wort, erstes) {
  if (woerter.includes(wort)) return 1000;
  if (erstes && h.startsWith(wort)) return 700;
  if (woerter.some((w) => w.startsWith(wort))) return 480;
  if (h.includes(wort)) return 160;
  return 0;
}

// Reine Textübereinstimmung (ohne Gewicht) — 0 = kein Treffer.
function textPunkte(zeile, teile) {
  const h = zeile.haystack || '';
  if (!h) return 0;
  const woerter = h.split(' ');
  let summe = 0;
  for (let i = 0; i < teile.length; i++) {
    const p = wortPunkte(h, woerter, teile[i], i === 0);
    if (!p) return 0;
    summe += p;
  }
  return summe / teile.length;
}

export function punkte(zeile, q) {
  const teile = String(q || '').split(' ').filter(Boolean);
  const p = textPunkte(zeile, teile);
  if (!p) return 0;
  return p + (zeile.weight || 0) + aktivitaetsBonus(zeile.activity_at);
}

function aktivitaetsBonus(activityAt) {
  if (!activityAt) return 0;
  const tage = (Date.now() - new Date(activityAt).getTime()) / 86400000;
  if (tage < 0) return 10;
  return Math.max(0, Math.round(10 - tage / 18));
}

// Feste Hierarchie (entschieden 02.10.2026): Kunde → Projekt → Aufgaben.
// Geld erscheint nur, wenn die Person Finanzrecht hat — das regelt bereits die
// Auslieferung des Index (getSearchIndex). Sprints und Zeitbuchungen sind keine
// eigenen Treffer mehr; ältere Zeilen dieser Art im Zwischenspeicher fallen so
// aus der Anzeige.
export const GRUPPEN = [
  { key: 'kunden', titel: 'Kunden', typen: ['kunde'], max: 3 },
  { key: 'projekte', titel: 'Projekte', typen: ['projekt', 'auftrag'], max: 5 },
  { key: 'aufgaben', titel: 'Aufgaben', typen: ['ticket'], max: 6 },
  { key: 'vertrieb', titel: 'Vertrieb', typen: ['deal', 'angebot'], max: 4 },
  { key: 'geld', titel: 'Geld', typen: ['cockpit', 'rechnung', 'anweisung', 'vertrag'], max: 3 },
  { key: 'post', titel: 'Post & Akte', typen: ['akte'], max: 3 },
  { key: 'springe', titel: 'Springe zu', typen: ['seite'], max: 2 },
];

const ABZUG_ERLEDIGT = 400;
const BONUS_EIGENE = 80;
const BONUS_KUNDENBAUM = 300;

export function suche(zeilen, eingabe, meineEmail = '') {
  const q = normalize(eingabe);
  if (!q) return { q, gruppen: [] };
  const teile = q.split(' ').filter(Boolean);
  const ich = String(meineEmail || '').toLowerCase();

  const treffer = [];
  for (const z of zeilen) {
    const text = textPunkte(z, teile);
    if (text > 0) treffer.push({ z, text });
  }

  // Kundenbaum: trifft die Eingabe klar einen oder zwei Kunden (ganzes Wort oder
  // Wortanfang), rücken deren Projekte und Aufgaben vor fremde Zufallstreffer.
  const klareKunden = treffer.filter((t) => t.z.entry_type === 'kunde' && t.text >= 480);
  const baum = klareKunden.length >= 1 && klareKunden.length <= 2
    ? new Set(klareKunden.map((t) => t.z.client_id).filter(Boolean))
    : new Set();

  // Kürzel exakt: „wid", „jl", „per" — das Projekt steht vorne, seine offenen
  // Aufgaben ebenso.
  const kuerzel = teile.length === 1 ? teile[0] : '';

  const bewertet = treffer.map(({ z, text }) => {
    let p = text + (z.weight || 0) + aktivitaetsBonus(z.activity_at);
    if (baum.size && (z.entry_type === 'projekt' || z.entry_type === 'ticket' || z.entry_type === 'deal') && baum.has(z.client_id)) p += BONUS_KUNDENBAUM;
    if (kuerzel && z.kuerzel && z.kuerzel === kuerzel) p += z.entry_type === 'projekt' ? 2000 : 500;
    if (z.entry_type === 'ticket') {
      if (z.ist_erledigt) p -= ABZUG_ERLEDIGT;
      else if (ich && String(z.owner_email || '').toLowerCase() === ich) p += BONUS_EIGENE;
    }
    return { ...z, punkte: p };
  });

  bewertet.sort((a, b) => b.punkte - a.punkte || String(b.activity_at || '').localeCompare(String(a.activity_at || '')));

  const gruppen = GRUPPEN.map((g) => {
    const alle = bewertet.filter((z) => g.typen.includes(z.entry_type));
    return { ...g, alle };
  }).filter((g) => g.alle.length > 0);

  return { q, gruppen };
}

// Zweitziel eines Treffers — per Klick auf den kleinen Verweis oder mit der
// Pfeiltaste → erreichbar. Projekt: Cockpit (route_cockpit kommt nur mit
// Finanzrecht an). Kunde: Kundendatensatz in der gefilterten Projektliste.
export function zweitZiel(z) {
  if (!z) return null;
  if (z.entry_type === 'projekt' && z.route_cockpit) {
    return { label: 'Cockpit', zeile: { ...z, entry_type: 'cockpit', title: `Cockpit · ${z.title}`, route: z.route_cockpit } };
  }
  if (z.entry_type === 'kunde' && z.route && z.route.startsWith('/sprint/projekte?kunde=')) {
    return { label: 'Kundendaten', zeile: { ...z, route: `${z.route}&kundendaten=1` } };
  }
  return null;
}
