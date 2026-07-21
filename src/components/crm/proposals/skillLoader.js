import { base44 } from '@/api/base44Client';

const cache = {};

async function fetchText(url) {
  const res = await fetch(url);
  return res.text();
}

// Loads SKILL.md + all references of a variant as one rules block.
export async function loadSkillRules(variant) {
  if (cache[variant]) return cache[variant];
  const docs = await base44.entities.ProposalSkillDoc.filter(
    { skill_variant: variant, include_in_prompt: true }, 'file_name', 100
  );
  const skillFirst = [...docs].sort((a, b) =>
    (a.doc_type === 'skill' ? 0 : 1) - (b.doc_type === 'skill' ? 0 : 1));
  const parts = await Promise.all(skillFirst.map(async d =>
    `\n\n===== DATEI: ${d.file_name} =====\n` + await fetchText(d.file_url)));
  cache[variant] = parts.join('');
  return cache[variant];
}

export async function loadConfigTemplate(variant) {
  const key = `tpl_${variant}`;
  if (cache[key]) return cache[key];
  const docs = await base44.entities.ProposalSkillDoc.filter(
    { skill_variant: variant, doc_type: 'config_template' }, 'file_name', 5
  );
  cache[key] = docs[0] ? await fetchText(docs[0].file_url) : '';
  return cache[key];
}