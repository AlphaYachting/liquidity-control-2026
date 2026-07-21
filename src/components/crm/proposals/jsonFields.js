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

export async function loadJsonField(record, field) {
  const str = await loadLargeText(record, field);
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}