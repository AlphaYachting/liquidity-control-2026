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

// Projekttyp aus den Modulnamen vorbelegen.
export function guessProjectType(proposal, positions) {
  const text = positions.map((p) => p.name).join(' ').toLowerCase();
  if (proposal?.sprint_mode) return 'sprint';
  if (/support|betreuung|wartung/.test(text)) return 'support';
  if (/kontingent|container|laufend|monatlich/.test(text)) return 'container';
  if (/regie|aufwand|stunden/.test(text)) return 'aufwand';
  return 'paket';
}