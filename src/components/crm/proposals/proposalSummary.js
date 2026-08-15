// Kurzinhalt und Preis für die Angebotsliste — reine Leseableitung, ohne Nebenwirkungen.

const TOTAL_KEYS = ['total_net', 'total_price_net', 'gesamt_netto', 'total', 'sum_net', 'summe_netto'];

function findTotal(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 3) return null;
  for (const key of TOTAL_KEYS) {
    const v = obj[key];
    if (typeof v === 'number' && v > 0) return v;
    if (typeof v === 'string' && Number(v) > 0) return Number(v);
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const found = findTotal(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

// Preis eines Angebots (netto) — bei Proposals aus der Config/Mapping-Struktur.
export function proposalTotalNet(proposal) {
  for (const raw of [proposal.config_json, proposal.mapping_json]) {
    if (!raw) continue;
    try {
      const found = findTotal(JSON.parse(raw));
      if (found) return found;
    } catch { /* unlesbares JSON wird übersprungen */ }
  }
  return null;
}

// Kurzer Inhaltsauszug — erstes vorhandenes inhaltliches Feld.
export function shortPreview(text, max = 160) {
  if (!text) return null;
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}