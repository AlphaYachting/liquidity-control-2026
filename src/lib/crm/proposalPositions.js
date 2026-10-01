// Liest die Positionen und den Auftragsrahmen aus dem angenommenen Studio-Angebot.
// Texte bleiben im Wortlaut des Angebots. Reine Leseableitung, keine Nebenwirkungen.

export const toAmount = (v) => {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const clean = String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : 0;
};

function readJson(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// "TT.MM.JJJJ" → "JJJJ-MM-TT"
export const deDatumZuIso = (s) => {
  const m = String(s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
};

const leer = (p) => ({ description: '', lieferumfang: [], korrekturschleifen: '', leistungszeitraum: '', abrechnung: 'einmalig', ...p });

// [{ name, amount, description, lieferumfang, abrechnung, optional_im_angebot, ... }]
export function proposalPositions(proposal, config) {
  if (Array.isArray(config?.POSITIONS) && config.POSITIONS.length > 0) {
    return config.POSITIONS.map((p) => leer({
      name: p.title || 'Position',
      amount: toAmount(p.price),
      description: [p.goal, p.result ? `Ergebnis: ${p.result}` : ''].filter(Boolean).join('\n\n'),
      lieferumfang: Array.isArray(p.items) ? p.items.filter(Boolean) : [],
      abrechnung: /monat/i.test(p.price_suffix || '') ? 'monatlich' : 'einmalig',
      optional_im_angebot: Boolean(p.optional),
    }));
  }
  // Rückfallebene: alte, kleingeschriebene Schlüssel
  for (const raw of [proposal?.config_json, proposal?.mapping_json]) {
    const data = readJson(raw);
    const list = data?.positions || data?.packages || data?.module || data?.modules;
    if (Array.isArray(list) && list.length > 0) {
      return list.map((p) => leer({
        name: p.title || p.name || p.label || 'Position',
        amount: toAmount(p.price ?? p.amount ?? p.price_net ?? p.total_net),
        optional_im_angebot: Boolean(p.optional),
      }));
    }
  }
  return [];
}

// Auftragsebene aus dem Studio-Angebot
export function studioAuftrag(config) {
  if (!config) return {};
  const timeline = Array.isArray(config.TIMELINE)
    ? config.TIMELINE.map((z) => (Array.isArray(z) ? `${z[0]}: ${z[1] || ''}` : String(z))).join('\n')
    : '';
  const nicht = [];
  const scope = String(config.CLIENT_PROJECT_SCOPE || '');
  const teil = scope.split(/NICHT(?:\s+IN)?:/i)[1];
  if (teil) teil.split(/,(?![^(]*\))/).map((s) => s.trim().replace(/\.$/, '')).filter(Boolean).forEach((s) => nicht.push(s));
  (config.CONVERSATION_EXCLUDED || []).forEach((z) => {
    const s = Array.isArray(z) ? z[0] : z;
    if (s && !nicht.includes(s)) nicht.push(s);
  });
  return {
    leistungszeitraum: timeline,
    liefertermin: deDatumZuIso(config.SPRINT_LIEFERTERMIN),
    nicht_enthalten: nicht,
    angebot_datum: deDatumZuIso(config.PROPOSAL_DATE),
    summe: toAmount(config.TOTAL_NET),
  };
}

// Arbeitsmodell des Katalogs auf die Übergabeblatt-Typen abbilden.
const MODEL_TO_TYPE = { sprint: 'sprint', support: 'support', container: 'container', intern: 'intern' };
// Das „größte" Arbeitsmodell gewinnt.
const TYPE_RANK = { sprint: 4, container: 3, support: 2, regie: 1, intern: 0 };

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
    // ausdrücklich gewähltes Katalogmodul schlägt jeden Namensabgleich
    const hit = (p.module_template_id && (modules || []).find((m) => m.id === p.module_template_id))
      || (modules || []).find((m) => m.default_arbeitsmodell && matchesModule(p.name, m.name));
    const type = hit ? MODEL_TO_TYPE[hit.default_arbeitsmodell] : null;
    if (type && (!best || TYPE_RANK[type] > TYPE_RANK[best])) best = type;
  }
  if (best) return best;

  const text = (positions || []).map((p) => p.name).join(' ').toLowerCase();
  if (/support|betreuung|wartung/.test(text)) return 'support';
  if (/kontingent|container|laufend|monatlich/.test(text)) return 'container';
  if (/regie|aufwand|stunden/.test(text)) return 'regie';
  // Web- und Print-Regel: abgegrenzte Leistungen mit Liefertermin
  if (/website|web|relaunch|neubau|erweiterung|landingpage|shop|onlineshop|seite|blog|flyer|druck|brosch|visitenkarte|print/.test(text)) return 'sprint';
  return 'sprint';
}