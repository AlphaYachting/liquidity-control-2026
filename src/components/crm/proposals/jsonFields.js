import { base44 } from '@/api/base44Client';

const LIMIT = 8000;

// Returns entity patch storing str inline or as uploaded file when too large.
export async function buildLargeTextPatch(field, str, fileName) {
  if ((str || '').length <= LIMIT) {
    return { [field]: str || '', [`${field}_url`]: '' };
  }
  const file = new File([str], fileName, { type: 'text/plain' });
  const { file_url } = await base44.integrations.Core.UploadFile({ file });
  return { [field]: '', [`${field}_url`]: file_url };
}

// Reads a possibly file-backed text field.
export async function loadLargeText(record, field) {
  if (record?.[field]) return record[field];
  const url = record?.[`${field}_url`];
  if (!url) return '';
  const res = await fetch(url);
  return res.text();
}

// LLM responses are sometimes wrapped in a { response: ... } envelope,
// where response can be an object or a JSON string. Unwrap until we hit real data.
export function unwrapLLM(result) {
  let r = result;
  for (let i = 0; i < 4; i++) {
    if (typeof r === 'string') {
      const s = r.trim().replace(/^```(json)?/, '').replace(/```$/, '').trim();
      try { r = JSON.parse(s); } catch { break; }
    } else if (r && typeof r === 'object' && !Array.isArray(r) && Object.keys(r).length === 1 && 'response' in r) {
      r = r.response;
    } else break;
  }
  return r;
}

export async function loadJsonField(record, field) {
  const str = await loadLargeText(record, field);
  if (!str) return null;
  try { return unwrapLLM(JSON.parse(str)); } catch { return null; }
}