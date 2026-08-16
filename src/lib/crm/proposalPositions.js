// Liest die Angebots-Module als Auftragspositionen aus dem angenommenen Angebot.
// Reine Leseableitung, keine Nebenwirkungen.

const toAmount = (v) => {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const clean = String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
};

function readJson(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// [{ name, amount, optional }]
export function proposalPositions(proposal) {
  for (const raw of [proposal?.config_json, proposal?.mapping_json]) {
    const data = readJson(raw);
    const list = data?.positions || data?.packages || data?.module || data?.modules;
    if (Array.isArray(list) && list.length > 0) {
      return list.map((p) => ({
        name: p.title || p.name || p.label || 'Position',
        amount: toAmount(p.price ?? p.amount ?? p.price_net ?? p.total_net),
        optional: Boolean(p.optional),
      }));
    }
  }
  return [];
}

// Arbeitsmodell des Katalogs auf die Übergabeblatt-Typen abbilden.
const MODEL_TO_TYPE = { sprint: 'sprint', support: 'support', container: 'container', intern: 'paket' };
// Das „größte" Arbeitsmodell gewinnt.
const TYPE_RANK = { sprint: 4, container: 3, support: 2, paket: 1 };

function matchesModule(positionName, moduleName) {
  const a = String(positionName || '').toLowerCase().trim();
  const b = String(moduleName || '').toLowerCase().trim();
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

// Projekttyp aus Katalog-Zuordnung, sonst aus den Modulnamen vorbelegen.
export function guessProjectType(proposal, positions, modules = []) {
  if (proposal?.sprint_mode) return 'sprint';

  let best = null;
  for (const p of positions || []) {
    const hit = (modules || []).find((m) => m.default_arbeitsmodell && matchesModule(p.name, m.name));
    const type = hit ? MODEL_TO_TYPE[hit.default_arbeitsmodell] : null;
    if (type && (!best || TYPE_RANK[type] > TYPE_RANK[best])) best = type;
  }
  if (best) return best;

  const text = (positions || []).map((p) => p.name).join(' ').toLowerCase();
  if (/support|betreuung|wartung/.test(text)) return 'support';
  if (/kontingent|container|laufend|monatlich/.test(text)) return 'container';
  if (/regie|aufwand|stunden/.test(text)) return 'aufwand';
  if (/website|web|relaunch|neubau|erweiterung|landingpage|shop|onlineshop|seite|blog/.test(text)) return 'sprint';
  return 'paket';
}