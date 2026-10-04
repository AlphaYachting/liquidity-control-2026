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

// Für die Projektlage: vollständige Stunden- und Aufgabensummen eines aWork-Projekts in einer Abfrage.
// Verwaltungslisten (Verrechnung, Organisation) zählen nicht als Leistungsaufgaben.
const VERWALTUNG = `(coalesce(l.name,'') ~* 'verrechnung|organisation')`;
export async function aworkLageSummen(aworkProjektId, messbeginn = '2026-08-01') {
  const id = sqlUuid(aworkProjektId);
  const ab = sqlDatum(messbeginn);
  const aufgaben = `from awork.tasks t left join awork.task_lists l on l.id = t.primary_task_list_id
            left join awork.task_statuses s on s.id = t.task_status_id
            where t.project_id = ${id} and not coalesce(t.is_subtask, false) and not ${VERWALTUNG}`;
  const rows = await aworkDbQuery(
    `select (select coalesce(sum(e.duration_sec),0) from awork.time_entries e where e.project_id = ${id}) as sekunden,
            (select coalesce(sum(e.duration_sec),0) from awork.time_entries e where e.project_id = ${id} and e.start_date_local >= ${ab}) as sekunden_ab_messbeginn,
            (select min(e.start_date_local) from awork.time_entries e where e.project_id = ${id}) as erste,
            (select max(e.start_date_local) from awork.time_entries e where e.project_id = ${id}) as letzte,
            (select max(e.start_date_local) from awork.time_entries e) as sicherung_bis,
            (select count(*) ${aufgaben}) as aufgaben,
            (select count(*) ${aufgaben} and s.type = 'done') as erledigt,
            (select coalesce(sum(t.planned_duration_sec),0) ${aufgaben} and s.type = 'done') as erledigt_plan_sekunden,
            (select time_budget_sec from awork.projects p where p.id = ${id}) as budget_sekunden`,
    { timeoutMs: 12000 });
  return rows[0] || null;
}

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
