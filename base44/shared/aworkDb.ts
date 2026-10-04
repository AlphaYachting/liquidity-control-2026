// Gemeinsamer Zugriff auf die eingefrorene aWork-Sicherung (PostgreSQL hinter rico-office.at).
// Nur lesend: die Schnittstelle nimmt genau eine SELECT-Anweisung je Aufruf an.
const URL_STANDARD = 'https://rico-office.at/awork-api/query.php';

export const aworkDbBereit = () => !!Deno.env.get('AWORK_DB_API_TOKEN');

// Textwert sicher in SQL einsetzen (einfache Anführungszeichen verdoppeln)
export const sqlText = (v) => `'${String(v ?? '').replace(/'/g, "''")}'`;

// Nur echte UUIDs als Id zulassen — alles andere wird abgewiesen
export const sqlUuid = (v) => {
  const s = String(v || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)) throw new Error('Ungültige aWork-Id');
  return `'${s}'`;
};

export const sqlDatum = (v) => {
  const s = String(v || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Ungültiges Datum');
  return `'${s}'`;
};

export const sqlZahl = (v, standard, max) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : standard;
};

export async function aworkDbQuery(sql, { timeoutMs = 25000 } = {}) {
  const token = Deno.env.get('AWORK_DB_API_TOKEN');
  if (!token) throw new Error('AWORK_DB_API_TOKEN nicht gesetzt');
  const url = Deno.env.get('AWORK_DB_API_URL') || URL_STANDARD;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `aWork-Sicherung HTTP ${res.status}`);
    return data.rows || [];
  } finally {
    clearTimeout(timer);
  }
}
