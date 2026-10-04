import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { aworkDbQuery, aworkDbBereit, sqlText, sqlUuid, sqlDatum, sqlZahl } from '../../shared/aworkDb.ts';

// Lesender Zugang zur eingefrorenen aWork-Sicherung — für die Projektintelligenz und die Projektansicht.
// Feste Aktionen statt freiem SQL: jede Abfrage ist begrenzt und holt nie die Spalte `raw`.
// Aktionen: health | projekt_suchen | projekt | stunden | aufgaben | aufgabe | akte | suche
const VERWALTUNG = `(coalesce(l.name,'') ~* 'verrechnung|organisation')`;

const AKTIONEN = {
  // Stand der Sicherung
  health: async () => aworkDbQuery(
    `select (select count(*) from awork.projects) as projekte,
            (select count(*) from awork.time_entries) as zeiteintraege,
            (select max(start_date_local) from awork.time_entries) as letzte_buchung`),

  // Projekt über Namen oder Kunde finden
  projekt_suchen: async (p) => {
    const q = `%${String(p.q || '').trim()}%`;
    if (q.length < 4) throw new Error('q (Suchtext) fehlt');
    return aworkDbQuery(
      `select p.id, p.project_key, p.name, c.name as kunde, s.name as status, s.type as status_typ,
              p.start_date, p.due_date, round(p.time_budget_sec/3600.0,1) as budget_stunden,
              round(p.tracked_duration_sec/3600.0,1) as gebucht_stunden
       from awork.projects p
       left join awork.companies c on c.id = p.company_id
       left join awork.project_statuses s on s.id = p.project_status_id
       where p.name ilike ${sqlText(q)} or c.name ilike ${sqlText(q)}
       order by p.updated_on desc nulls last limit ${sqlZahl(p.limit, 25, 50)}`);
  },

  // Kopfdaten eines Projekts
  projekt: async (p) => aworkDbQuery(
    `select p.id, p.project_key, p.name, left(p.description, 2000) as beschreibung, c.name as kunde,
            s.name as status, s.type as status_typ, p.is_retainer, p.start_date, p.due_date, p.created_on,
            round(p.time_budget_sec/3600.0,1) as budget_stunden,
            round((select coalesce(sum(e.duration_sec),0) from awork.time_entries e where e.project_id = p.id)/3600.0,1) as gebucht_stunden,
            (select min(e.start_date_local) from awork.time_entries e where e.project_id = p.id) as erste_buchung,
            (select max(e.start_date_local) from awork.time_entries e where e.project_id = p.id) as letzte_buchung,
            p.tasks_count, p.tasks_done_count
     from awork.projects p
     left join awork.companies c on c.id = p.company_id
     left join awork.project_statuses s on s.id = p.project_status_id
     where p.id = ${sqlUuid(p.project_id)}`),

  // Stunden eines Projekts — gruppiert nach monat | person | arbeitsart | aufgabe | liste
  stunden: async (p) => {
    const gruppen = {
      monat: { feld: `to_char(e.start_date_local, 'YYYY-MM')`, join: '' },
      person: { feld: `coalesce(u.first_name || ' ' || u.last_name, 'unbekannt')`, join: 'left join awork.users u on u.id = e.user_id' },
      arbeitsart: { feld: `coalesce(w.name, 'ohne Arbeitsart')`, join: 'left join awork.types_of_work w on w.id = e.type_of_work_id' },
      aufgabe: { feld: `coalesce(t.name, 'ohne Aufgabe')`, join: 'left join awork.tasks t on t.id = e.task_id' },
      liste: { feld: `coalesce(l.name, 'ohne Liste')`, join: 'left join awork.tasks t on t.id = e.task_id left join awork.task_lists l on l.id = t.primary_task_list_id' },
    };
    const g = gruppen[p.gruppe || 'monat'];
    if (!g) throw new Error('gruppe muss monat, person, arbeitsart, aufgabe oder liste sein');
    const von = p.von ? ` and e.start_date_local >= ${sqlDatum(p.von)}` : '';
    const bis = p.bis ? ` and e.start_date_local <= ${sqlDatum(p.bis)}` : '';
    return aworkDbQuery(
      `select ${g.feld} as gruppe, round(sum(e.duration_sec)/3600.0,1) as stunden,
              round(coalesce(sum(e.duration_sec) filter (where e.is_billable),0)/3600.0,1) as davon_abrechenbar,
              round(coalesce(sum(e.duration_sec) filter (where e.is_billed),0)/3600.0,1) as davon_verrechnet,
              count(*) as buchungen, min(e.start_date_local) as von, max(e.start_date_local) as bis
       from awork.time_entries e ${g.join}
       where e.project_id = ${sqlUuid(p.project_id)}${von}${bis}
       group by 1 order by ${p.gruppe === 'monat' || !p.gruppe ? '1' : '2 desc'} limit 200`);
  },

  // Aufgaben eines Projekts mit Plan, Ist und Status
  aufgaben: async (p) => aworkDbQuery(
    `select t.id, t.name, l.name as liste, s.name as status, s.type as status_typ,
            round(t.planned_duration_sec/3600.0,1) as plan_stunden, round(t.tracked_duration_sec/3600.0,1) as ist_stunden,
            t.created_on::date as angelegt, t.due_on::date as faellig, t.closed_on::date as erledigt_am, t.comment_count, t.is_subtask
     from awork.tasks t
     left join awork.task_statuses s on s.id = t.task_status_id
     left join awork.task_lists l on l.id = t.primary_task_list_id
     where t.project_id = ${sqlUuid(p.project_id)}
     order by t.tracked_duration_sec desc nulls last limit ${sqlZahl(p.limit, 150, 400)}`),

  // Eine Aufgabe im Detail: Beschreibung, Kommentare, Checkliste, Buchungen
  aufgabe: async (p) => {
    const id = sqlUuid(p.task_id);
    const [kopf, kommentare, checkliste, buchungen] = await Promise.all([
      aworkDbQuery(`select t.name, left(regexp_replace(coalesce(t.description,''), '<[^>]+>', ' ', 'g'), 4000) as beschreibung,
                           t.created_on, t.closed_on, round(t.planned_duration_sec/3600.0,1) as plan_stunden,
                           round(t.tracked_duration_sec/3600.0,1) as ist_stunden
                    from awork.tasks t where t.id = ${id}`),
      aworkDbQuery(`select c.created_on, coalesce(u.first_name || ' ' || u.last_name, '') as von, left(c.plain_text, 3000) as text
                    from awork.comments c left join awork.users u on u.id = c.user_id
                    where c.task_id = ${id} order by c.created_on limit 100`),
      aworkDbQuery(`select name, is_done from awork.checklist_items where task_id = ${id} order by "order" limit 100`),
      aworkDbQuery(`select e.start_date_local as datum, coalesce(u.first_name || ' ' || u.last_name, '') as von,
                           round(e.duration_sec/3600.0,2) as stunden, left(coalesce(e.note,''), 300) as notiz
                    from awork.time_entries e left join awork.users u on u.id = e.user_id
                    where e.task_id = ${id} order by e.start_date_local limit 200`),
    ]);
    return [{ aufgabe: kopf[0] || null, kommentare, checkliste, buchungen }];
  },

  // Projektakte in zeitlicher Reihenfolge (Aufgaben, Kommentare, Dokumente, Dateinamen) — ohne Zeiteinträge
  akte: async (p) => {
    const von = p.von ? ` and at >= ${sqlDatum(p.von)}` : '';
    const bis = p.bis ? ` and at < (${sqlDatum(p.bis)}::date + 1)` : '';
    const art = p.art ? ` and kind = ${sqlText(p.art)}` : ` and kind <> 'time_entry'`;
    return aworkDbQuery(
      `select at, kind as art, id, task_id, title as titel, left(body, ${sqlZahl(p.zeichen, 400, 2000)}) as auszug
       from search.items
       where project_id = ${sqlUuid(p.project_id)}${art}${von}${bis}
       order by at ${p.neueste_zuerst ? 'desc' : 'asc'} nulls last limit ${sqlZahl(p.limit, 80, 200)}`);
  },

  // Volltextsuche (deutsche Wortstämme) — optional auf ein Projekt begrenzt
  suche: async (p) => {
    const q = String(p.q || '').trim();
    if (q.length < 3) throw new Error('q (Suchtext) fehlt');
    const projekt = p.project_id ? ` and i.project_id = ${sqlUuid(p.project_id)}` : '';
    return aworkDbQuery(
      `select i.at, i.kind as art, i.id, i.project_id, i.task_id, pr.name as projekt, i.title as titel, left(i.body, 400) as auszug
       from search.items i left join awork.projects pr on pr.id = i.project_id
       where (i.tsv @@ websearch_to_tsquery('german', ${sqlText(q)}) or (i.title || ' ' || i.body) ilike ${sqlText(`%${q}%`)})${projekt}
       order by i.at desc nulls last limit ${sqlZahl(p.limit, 40, 100)}`);
  },
};

// Für die Projektlage: vollständige Stunden- und Aufgabensummen eines Projekts in einer Abfrage
export const LAGE_SQL = (aworkId) =>
  `select (select coalesce(sum(e.duration_sec),0) from awork.time_entries e where e.project_id = ${aworkId}) as sekunden,
          (select min(e.start_date_local) from awork.time_entries e where e.project_id = ${aworkId}) as erste,
          (select max(e.start_date_local) from awork.time_entries e where e.project_id = ${aworkId}) as letzte,
          (select max(e.start_date_local) from awork.time_entries e) as sicherung_bis,
          (select count(*) from awork.tasks t left join awork.task_lists l on l.id = t.primary_task_list_id
            where t.project_id = ${aworkId} and not t.is_subtask and not ${VERWALTUNG}) as aufgaben,
          (select count(*) from awork.tasks t left join awork.task_lists l on l.id = t.primary_task_list_id
            left join awork.task_statuses s on s.id = t.task_status_id
            where t.project_id = ${aworkId} and not t.is_subtask and not ${VERWALTUNG} and s.type = 'done') as erledigt,
          (select coalesce(sum(t.planned_duration_sec),0) from awork.tasks t left join awork.task_lists l on l.id = t.primary_task_list_id
            left join awork.task_statuses s on s.id = t.task_status_id
            where t.project_id = ${aworkId} and not t.is_subtask and not ${VERWALTUNG} and s.type = 'done') as erledigt_plan_sekunden,
          (select time_budget_sec from awork.projects p where p.id = ${aworkId}) as budget_sekunden`;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!aworkDbBereit()) return Response.json({ error: 'aWork-Sicherung nicht eingerichtet: Secret AWORK_DB_API_TOKEN fehlt.' }, { status: 503 });

    const { action, params = {} } = await req.json().catch(() => ({}));
    const aktion = AKTIONEN[action];
    if (!aktion) return Response.json({ error: `Unbekannte Aktion. Erlaubt: ${Object.keys(AKTIONEN).join(', ')}` }, { status: 400 });

    const rows = await aktion(params);
    return Response.json({
      quelle: 'aWork-Sicherung (eingefroren, nur lesend)',
      action, count: rows.length, rows,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
