import { createClientFromRequest } from 'npm:@base44/sdk@0.8.43';
import { makeAwork, sleep } from './aworkFetch.js';
import {
  csvBauen, TIMEENTRY_SPALTEN, timeentryMap, TASK_SPALTEN, taskMap,
  COMMENT_SPALTEN, commentMap, PROJECT_SPALTEN, projectMap,
} from './csvFelder.js';

const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Monatsschnitte zwischen zwei Datumsangaben — Zeitbuchungen werden monatsweise gezogen.
function monate(from, to) {
  const list = [];
  const [jv, mv] = from.split('-').map(Number);
  const ende = to.slice(0, 7);
  let j = jv, m = mv;
  while (`${j}-${String(m).padStart(2, '0')}` <= ende) {
    const letzter = new Date(Date.UTC(j, m, 0)).getUTCDate();
    list.push({
      label: `${j}-${String(m).padStart(2, '0')}`,
      von: `${j}-${String(m).padStart(2, '0')}-01`,
      bis: `${j}-${String(m).padStart(2, '0')}-${String(letzter).padStart(2, '0')}`,
      letzter,
    });
    m++;
    if (m > 12) { m = 1; j++; }
  }
  return list;
}

const zeitfilter = (von, bis) =>
  `/timeentries?filterby=${encodeURIComponent(`startDateLocal ge datetime'${von}T00:00' and startDateLocal le datetime'${bis}T23:59'`)}`;

export default async function (req) {
  const base44 = createClientFromRequest(req);
  let syncLog = null;

  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const apiKey = Deno.env.get('AWORK_API_KEY');
    const apiBase = Deno.env.get('AWORK_API_BASE_URL') || 'https://api.awork.com';
    if (!apiKey) return Response.json({ error: 'AWORK_API_KEY nicht konfiguriert' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const heute = new Date().toISOString().slice(0, 10);
    const from = body.from || '2019-01-01';
    const to = body.to || heute;
    const include = Array.isArray(body.include) && body.include.length
      ? body.include
      : ['projects', 'tasks', 'timeentries', 'comments', 'stammdaten'];

    const startedAt = new Date().toISOString();
    const fehler = [];
    const hinweise = [];
    const awork = makeAwork(apiBase, apiKey, fehler);

    syncLog = await base44.asServiceRole.entities.AworkSyncLog.create({
      sync_type: 'archive_export',
      started_at: startedAt,
      status: 'running',
      triggered_by: 'manual',
      notes: `Archiv-Export ${from} – ${to} läuft`,
    }).catch(() => null);

    // ---- Projekte (Grundlage für alle projektbezogenen Abrufe)
    let projects = [];
    const brauchtProjekte = ['projects', 'tasks', 'comments'].some((k) => include.includes(k));
    if (brauchtProjekte) {
      const r = await awork.holeSeitenweise('/projects', { pageSize: 500, maxSeiten: 60 });
      projects = r.rows;
    }

    // ---- Aufgaben, Tasklisten, Status je Projekt
    const tasklists = [], taskstatuses = [], tasks = [];
    if (include.includes('tasks')) {
      for (const p of projects) {
        const tl = await awork.hole(`/projects/${p.id}/tasklists`);
        if (tl) tasklists.push(...tl.map((x) => ({ ...x, _projectId: p.id })));
        const ts = await awork.hole(`/projects/${p.id}/taskstatuses`);
        if (ts) taskstatuses.push(...ts.map((x) => ({ ...x, _projectId: p.id })));
        const pt = await awork.holeSeitenweise(`/projects/${p.id}/projecttasks`, { pageSize: 500, maxSeiten: 40 });
        tasks.push(...pt.rows.map((x) => ({ ...x, _projectId: p.id, _projectName: p.name })));
        await sleep(200);
      }
    }

    // ---- Zeitbuchungen monatsweise
    const timeentries = [];
    if (include.includes('timeentries')) {
      for (const m of monate(from, to)) {
        const von = m.von < from ? from : m.von;
        const bis = m.bis > to ? to : m.bis;
        const r = await awork.holeSeitenweise(zeitfilter(von, bis), { pageSize: 500, maxSeiten: 20 });
        if (!r.limitErreicht) {
          timeentries.push(...r.rows);
        } else {
          // Obergrenze erreicht — Monat halbieren, sonst wäre der Export unvollständig
          hinweise.push(`Monat ${m.label} hat die Seitengrenze erreicht und wurde geteilt.`);
          const mitte = Math.min(15, m.letzter);
          const haelften = [[von, `${m.label}-${String(mitte).padStart(2, '0')}`],
            [`${m.label}-${String(mitte + 1).padStart(2, '0')}`, bis]];
          for (const [a, b] of haelften) {
            if (a > b) continue;
            const h = await awork.holeSeitenweise(zeitfilter(a, b), { pageSize: 500, maxSeiten: 20 });
            timeentries.push(...h.rows);
            if (h.limitErreicht) {
              fehler.push({ pfad: zeitfilter(a, b), status: 0, meldung: 'Seitengrenze auch nach Teilung erreicht — Zeitraum unvollständig' });
            }
            await sleep(200);
          }
        }
        await sleep(200);
      }
    }

    // ---- Kommentare: je Projekt, und je Aufgabe nur bei commentCount > 0
    const comments = [];
    if (include.includes('comments')) {
      for (const p of projects) {
        const c = await awork.hole(`/projects/${p.id}/comments`);
        if (c) comments.push(...c.map((x) => ({ ...x, _entityType: 'project', _projectId: p.id })));
        await sleep(200);
      }
      for (const t of tasks.filter((x) => (x.commentCount || 0) > 0)) {
        const c = await awork.hole(`/tasks/${t.id}/comments`);
        if (c) comments.push(...c.map((x) => ({ ...x, _entityType: 'task', _projectId: t._projectId, _taskId: t.id })));
        await sleep(200);
      }
    }

    // ---- Stammdaten
    let users = [], companies = [], typeofwork = [], projecttemplates = [];
    if (include.includes('stammdaten')) {
      users = (await awork.holeSeitenweise('/users', { pageSize: 500, maxSeiten: 20 })).rows;
      companies = (await awork.holeSeitenweise('/companies', { pageSize: 500, maxSeiten: 60 })).rows;
      typeofwork = (await awork.hole('/typeofwork')) || [];
      projecttemplates = (await awork.hole('/projecttemplates')) || [];
    }

    // ---- Dateien erzeugen und ablegen
    const praefix = `awork-archiv-${heute}`;
    const dateien = [];

    const ablegen = async (name, inhalt) => {
      const sha = await sha256(inhalt);
      const bytes = new TextEncoder().encode(inhalt).length;
      const zeilen = inhalt ? inhalt.split('\n').filter((z) => z.trim()).length : 0;
      const file = new File([inhalt], `${praefix}-${name}`, { type: 'text/plain' });
      const up = await base44.asServiceRole.integrations.Core.UploadFile({ file }).catch((e) => {
        fehler.push({ pfad: name, status: 0, meldung: `Upload fehlgeschlagen: ${e?.message || ''}` });
        return null;
      });
      dateien.push({ name: `${praefix}-${name}`, zeilen, bytes, sha256: sha, url: up?.file_url || '' });
    };

    const rohdaten = [
      ['projects.jsonl', projects], ['tasklists.jsonl', tasklists], ['taskstatuses.jsonl', taskstatuses],
      ['tasks.jsonl', tasks], ['timeentries.jsonl', timeentries], ['comments.jsonl', comments],
      ['users.jsonl', users], ['companies.jsonl', companies], ['typeofwork.jsonl', typeofwork],
      ['projecttemplates.jsonl', projecttemplates],
    ];
    for (const [name, rows] of rohdaten) {
      if (!rows.length) continue;
      await ablegen(name, jsonl(rows));
    }

    if (timeentries.length) await ablegen('timeentries.csv', csvBauen(TIMEENTRY_SPALTEN, timeentries, timeentryMap));
    if (tasks.length) await ablegen('tasks.csv', csvBauen(TASK_SPALTEN, tasks, taskMap));
    if (comments.length) await ablegen('comments.csv', csvBauen(COMMENT_SPALTEN, comments, commentMap));
    if (projects.length) await ablegen('projects.csv', csvBauen(PROJECT_SPALTEN, projects, projectMap));

    // ---- Summen
    const minutenJeJahr = {};
    let minutenGesamt = 0;
    for (const e of timeentries) {
      const m = typeof e.duration === 'number' ? Math.round(e.duration / 60) : 0;
      minutenGesamt += m;
      const jahr = (e.startDateLocal || '').slice(0, 4) || 'unbekannt';
      minutenJeJahr[jahr] = (minutenJeJahr[jahr] || 0) + m;
    }
    const summen = {
      minuten_gesamt: minutenGesamt,
      minuten_je_jahr: minutenJeJahr,
      projekte: projects.length,
      aufgaben: tasks.length,
      kommentare: comments.length,
      nutzer: users.length,
      zeitbuchungen: timeentries.length,
    };

    const manifest = {
      export_utc: new Date().toISOString(),
      export_lokal: new Date().toLocaleString('de-AT', { timeZone: 'Europe/Vienna' }),
      zeitraum: { from, to },
      include,
      ausgefuehrt_von: user.full_name || user.email,
      dateien,
      summen,
      hinweise,
      fehlgeschlagene_abrufe: fehler,
      wichtig: 'Dateianhänge aus awork sind in diesem Export NICHT enthalten. Die JSONL-Dateien sind die Wahrheit, die CSV ist nur Lesefassung.',
    };
    const manifestTxt = [
      `awork Archiv-Export`,
      `Export UTC: ${manifest.export_utc} · lokal: ${manifest.export_lokal}`,
      `Zeitraum: ${from} bis ${to} · ausgeführt von: ${manifest.ausgefuehrt_von}`,
      '',
      'Dateien (Zeilen · Bytes · SHA-256):',
      ...dateien.map((d) => `  ${d.name}  ${d.zeilen} · ${d.bytes} · ${d.sha256}\n    ${d.url || 'kein Upload'}`),
      '',
      `Zeitbuchungen: ${summen.zeitbuchungen} · Minuten gesamt: ${minutenGesamt}`,
      ...Object.entries(minutenJeJahr).sort().map(([j, m]) => `  ${j}: ${m} Minuten`),
      `Projekte: ${summen.projekte} · Aufgaben: ${summen.aufgaben} · Kommentare: ${summen.kommentare} · Nutzer: ${summen.nutzer}`,
      '',
      hinweise.length ? `Hinweise:\n${hinweise.map((h) => '  ' + h).join('\n')}` : 'Hinweise: keine',
      fehler.length
        ? `Fehlgeschlagene Abrufe (${fehler.length}):\n${fehler.map((f) => `  ${f.pfad} — ${f.status} ${f.meldung}`).join('\n')}`
        : 'Fehlgeschlagene Abrufe: keine',
      '',
      manifest.wichtig,
    ].join('\n');

    // Manifeste selbst ohne Prüfsummenrunde ablegen
    for (const [name, inhalt] of [['manifest.json', JSON.stringify(manifest, null, 2)], ['manifest.txt', manifestTxt]]) {
      const file = new File([inhalt], `${praefix}-${name}`, { type: 'text/plain' });
      const up = await base44.asServiceRole.integrations.Core.UploadFile({ file }).catch(() => null);
      dateien.push({
        name: `${praefix}-${name}`,
        zeilen: inhalt.split('\n').length,
        bytes: new TextEncoder().encode(inhalt).length,
        sha256: await sha256(inhalt),
        url: up?.file_url || '',
      });
    }

    if (syncLog?.id) {
      await base44.asServiceRole.entities.AworkSyncLog.update(syncLog.id, {
        finished_at: new Date().toISOString(),
        status: fehler.length ? 'partial' : 'success',
        records_fetched: projects.length + tasks.length + timeentries.length + comments.length,
        records_failed: fehler.length,
        errors: fehler.length ? JSON.stringify(fehler).slice(0, 500) : '',
        notes: manifestTxt.slice(0, 12000),
      }).catch(() => {});
    }

    return Response.json({ ok: true, dateien, summen, fehlgeschlagene_abrufe: fehler, hinweise });
  } catch (error) {
    if (syncLog?.id) {
      await base44.asServiceRole.entities.AworkSyncLog.update(syncLog.id, {
        finished_at: new Date().toISOString(),
        status: 'failed',
        errors: String(error?.message || error).slice(0, 500),
      }).catch(() => {});
    }
    return Response.json({ error: error?.message || 'Archiv-Export fehlgeschlagen' }, { status: 500 });
  }
}