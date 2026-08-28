import { normalize } from '@/lib/searchNormalize';

// Bewertung gegen die normalisierte Eingabe — synchron über das Array im
// Speicher, ohne Netzaufruf und ohne Entprellung.
export function punkte(zeile, q) {
  const h = zeile.haystack || '';
  if (!h) return 0;
  const woerter = h.split(' ');
  let p = 0;
  if (woerter.includes(q)) p = 1000;
  else if (h.startsWith(q)) p = 700;
  else if (woerter.some((w) => w.startsWith(q))) p = 480;
  else if (h.includes(q)) p = 160;
  else return 0;
  return p + (zeile.weight || 0) + aktivitaetsBonus(zeile.activity_at);
}

function aktivitaetsBonus(activityAt) {
  if (!activityAt) return 0;
  const tage = (Date.now() - new Date(activityAt).getTime()) / 86400000;
  if (tage < 0) return 10;
  return Math.max(0, Math.round(10 - tage / 18));
}

export const GRUPPEN = [
  { key: 'kunden', titel: 'Kunden', typen: ['kunde'], max: 4 },
  { key: 'projekte', titel: 'Projekte & Aufträge', typen: ['projekt', 'auftrag'], max: 3 },
  { key: 'geld', titel: 'Geld', typen: ['rechnung', 'anweisung', 'angebot', 'vertrag'], max: 3 },
  { key: 'arbeit', titel: 'Arbeit', typen: ['sprint', 'ticket', 'zeit'], max: 3 },
  { key: 'post', titel: 'Post & Akte', typen: ['akte'], max: 3 },
  { key: 'springe', titel: 'Springe zu', typen: ['seite'], max: 2 },
];

export function suche(zeilen, eingabe) {
  const q = normalize(eingabe);
  if (!q) return { q, gruppen: [] };
  const bewertet = [];
  for (const z of zeilen) {
    const p = punkte(z, q);
    if (p > 0) bewertet.push({ ...z, punkte: p });
  }
  bewertet.sort((a, b) => b.punkte - a.punkte || String(b.activity_at || '').localeCompare(String(a.activity_at || '')));

  const gruppen = GRUPPEN.map((g) => {
    const alle = bewertet.filter((z) => g.typen.includes(z.entry_type));
    return { ...g, alle };
  }).filter((g) => g.alle.length > 0);

  return { q, gruppen };
}