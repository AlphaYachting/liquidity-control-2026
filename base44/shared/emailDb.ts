// Gemeinsamer Zugriff auf die zentrale E-Mail-Datenbank (rico-office.at).
const BASE = 'https://rico-office.at/api';

function authHeader() {
  const token = Deno.env.get('EMAIL_DB_API_TOKEN');
  if (!token) throw new Error('EMAIL_DB_API_TOKEN nicht gesetzt');
  return { 'Authorization': `Bearer ${token}` };
}

export async function emailDbGet(path, params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v) !== '') qs.set(k, String(v));
  });
  const res = await fetch(`${BASE}/${path}${qs.toString() ? `?${qs.toString()}` : ''}`, { headers: authHeader() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `E-Mail-DB HTTP ${res.status}`);
  return data;
}

export async function emailDbEnrich(threadId, fields) {
  const res = await fetch(`${BASE}/enrich_thread`, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ thread_id: threadId, fields }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `E-Mail-DB HTTP ${res.status}`);
  return data;
}