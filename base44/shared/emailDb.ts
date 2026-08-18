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
  const url = `${BASE}/${path}${qs.toString() ? `?${qs.toString()}` : ''}`;
  // Die E-Mail-DB begrenzt die Zugriffsrate. Bei Drosselung kurz warten und erneut
  // versuchen, statt den Abruf verloren zu geben (sonst fehlen einzelne Verläufe).
  for (let versuch = 0; versuch < 3; versuch++) {
    const res = await fetch(url, { headers: authHeader() });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    const msg = data?.error || `E-Mail-DB HTTP ${res.status}`;
    const gedrosselt = res.status === 429 || /rate limit/i.test(String(msg));
    if (!gedrosselt || versuch === 2) throw new Error(msg);
    await new Promise((r) => setTimeout(r, 1500 * (versuch + 1)));
  }
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