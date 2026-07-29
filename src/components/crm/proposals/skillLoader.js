import { base44 } from '@/api/base44Client';

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = {};

// Cache-Eintraege verfallen nach CACHE_TTL_MS, damit ein Skill-Update ohne harten
// Reload greift. invalidateSkillCache() erzwingt das sofortige Neuladen.
function getCached(key) {
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    delete cache[key];
    return null;
  }
  return entry.value;
}

function setCached(key, value) {
  cache[key] = { value, ts: Date.now() };
  return value;
}

export function invalidateSkillCache() {
  Object.keys(cache).forEach(k => delete cache[k]);
}

async function fetchText(url, fileName) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Skill-Dokument "${fileName || url}" konnte nicht geladen werden (HTTP ${res.status}).`);
  }
  return res.text();
}

// Dokumente der Variante PLUS gemeinsame ('shared') Dokumente
async function loadDocs(query) {
  const [variantDocs, sharedDocs] = await Promise.all([
    base44.entities.ProposalSkillDoc.filter(query, 'file_name', 100),
    base44.entities.ProposalSkillDoc.filter({ ...query, skill_variant: 'shared' }, 'file_name', 100),
  ]);
  return [...variantDocs, ...sharedDocs];
}

// Loads SKILL.md + all references of a variant (incl. shared docs) as one rules block.
export async function loadSkillRules(variant) {
  // Existenz pruefen, nicht Wahrheitswert: ein leeres Template ist ein gueltiger Cache-Treffer
  const cached = getCached(variant);
  if (cached !== null) return cached;
  const docs = await loadDocs({ skill_variant: variant, include_in_prompt: true });
  const skillFirst = [...docs].sort((a, b) =>
    (a.doc_type === 'skill' ? 0 : 1) - (b.doc_type === 'skill' ? 0 : 1));
  const parts = await Promise.all(skillFirst.map(async d =>
    `\n\n===== DATEI: ${d.file_name} =====\n` + await fetchText(d.file_url, d.file_name)));
  return setCached(variant, parts.join(''));
}

export async function loadConfigTemplate(variant) {
  const key = `tpl_${variant}`;
  const cached = getCached(key);
  if (cached !== null) return cached;
  const docs = await loadDocs({ skill_variant: variant, doc_type: 'config_template' });
  return setCached(key, docs[0] ? await fetchText(docs[0].file_url, docs[0].file_name) : '');
}