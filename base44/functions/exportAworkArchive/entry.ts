import { createClientFromRequest } from 'npm:@base44/sdk@0.8.43';
import { makeAwork, sleep } from './aworkFetch.js';
import { ladeAnhaenge, ladeDokumente, sha256 } from './dateienExport.js';
import {
  csvBauen, TIMEENTRY_SPALTEN, timeentryMap, TASK_SPALTEN, taskMap,
  COMMENT_SPALTEN, commentMap, PROJECT_SPALTEN, projectMap,
} from './csvFelder.js';

const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');

// Monatsschnitte — NUR Zeitbuchungen werden zeitlich begrenzt.
function monate(from, to) {
  const list = [];
  const [jv, mv] = from.split('-').map(Number);
  const ende = to.slice(0, 7);
  let j = jv, m = mv;
  while (`${j}-${String(m).padStart(2, '0')}` <= ende) {
    const letzter = new Date(Date.UTC(j, m, 0)).getUTCDate();
    const label = `${j}-${String(m).padStart(2, '0')}`;
    list.push({ label, von: `${label}-01`, bis: `${label}-${String(letzter).padStart(2, '0')}`, letzter });
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

    // Zeitraum — wirkt ausschliesslich auf Zeitbuchungen. jahr ist die Kurzform für Teilläufe.
    const jahr = body.jahr ? String(body.jahr) : null;
    const from = jahr ? `${jahr}-01-01` : (body.from || '2019-01-01');
    const to = jahr ? (jahr === heute.slice(0, 4) ? heute : `${jahr}-12-31`) : (body.to || heute);

    const include = Array.isArray(body.include) && body.include.length
      ? body.include
      : ['projects', 'tasks', 'timeentries', 'comments', 'stammdaten', 'files', 'documents'];

    const startedAt = new Date().toISOString();
    const fehler = [];
    const hinweise = [];
    const awork = makeAwork(apiBase, apiKey, fehler);

    syncLog = await base44.asServiceRole.entities.AworkSyncLog.create({
      sync_type: 'archive_export',
      started_at: startedAt,
      status: 'running',
      triggered_by: 'manual',
      notes: `Archiv-Export läuft — Zeitbuchungen ${from} – ${to}${jahr ? ` (Teillauf ${jahr})` : ''}`,
    }).catch(() => null);

    // ---- Projekte: IMMER vollständig, unabhängig vom Zeitraum
    let projects = [];
    const brauchtProjekte = ['projects', 'tasks', 'comments', 'files', 'documents'].some((k) => include.includes(k));
    if (brauchtProjekte) {
      const r = await awork.holeSeitenweise('/projects', { pageSize: 500, maxSeiten: 60 });
      projects = r.rows;
      if (r.limitErreicht) fehler.push({ pfad: '/projects', status: 0, meldung: 'Seitengrenze erreicht — Projektliste unvollständig' });
    }
    const projektNamen = {};
    for (const p of projects) projektNamen[p.id] = p.name;

    // ---- Aufgaben, Tasklisten, Statusdefinitionen: IMMER vollständig
    const tasklists = [], taskstatuses = [], tasks = [];
    if (include.includes('tasks')) {
      for (const p of projects) {
        const tl = await awork.hole(`/projects/${p.id}/tasklists`);
        if (tl) tasklists.push(...tl.map((x) => ({ ...x, _projectId: p.id })));
        const ts = await awork.hole(`/projects/${p.id}/taskstatuses`);
        if (ts) taskstatuses.push(...ts.map((x) => ({ ...x, _projectId: p.id })));
        const pt = await awork.holeSeitenweise(`/projects/${p.id}/projecttasks`, { pageSize: 500, maxSeiten: 40 });
        if (pt.limitErreicht) fehler.push({ pfad: `/projects/${p.id}/projecttasks`, status: 0, meldung: 'Seitengrenze erreicht — Aufgaben unvollständig' });
        tasks.push(...pt.rows.map((x) => ({ ...x, _projectId: p.id, _projectName: p.name })));
        await sleep(200);
      }
    }

    // ---- Zeitbuchungen: die EINZIGE zeitraumbegrenzte Objektart, monatsweise
    const timeentries = [];
    if (include.includes('timeentries')) {
      for (const m of monate(from, to)) {
        const von = m.von < from ? from : m.von;
        const bis = m.bis > to ? to : m.bis;
        const r = await awork.holeSeitenweise(zeitfilter(von, bis), { pageSize: 500, maxSeiten: 20 });
        if (!r.limitErreicht) {
          timeentries.push(...r.rows);
        } else {
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

    // ---- Kommentare: IMMER vollständig; Aufgabenkommentare nur bei commentCount > 0
    const comments = [];
    let kommentareErwartet = 0;
    if (include.includes('comments')) {
      for (const p of projects) {
        const c = await awork.hole(`/projects/${p.id}/comments`);
        if (c) comments.push(...c.map((x) => ({ ...x, _entityType: 'project', _projectId: p.id })));
        await sleep(200);
      }
      const mitKommentaren = tasks.filter((x) => (x.commentCount || 0) > 0);
      kommentareErwartet = comments.length + mitKommentaren.reduce((s, t) => s + (t.commentCount || 0), 0);
      for (const t of mitKommentaren) {
        const c = await awork.hole(`/tasks/${t.id}/comments`);
        if (c) comments.push(...c.map((x) => ({ ...x, _entityType: 'task', _projectId: t._projectId, _taskId: t.id })));
        await sleep(200);
      }
    }

    // ---- Anhänge: Metadaten je Projekt, danach jede Datei roh herunterladen
    const files = [];
    let anhaenge = { abgelegt: [], volumen: 0 };
    if (include.includes('files')) {
      for (const p of projects) {
        const r = await awork.holeSeitenweise(`/projects/${p.id}/allfiles`, { pageSize: 200, maxSeiten: 100 });
        if (r.limitErreicht) fehler.push({ pfad: `/projects/${p.id}/allfiles`, status: 0, meldung: 'Seitengrenze erreicht — Dateiliste unvollständig' });
        files.push(...r.rows.map((f) => ({
          id: f.id,
          fileName: f.fileName || f.name || '',
          mimeType: f.mimeType || '',
          entityType: f.entityType || '',
          entityId: f.entityId || '',
          projectId: f.projectId || p.id,
          taskId: f.taskId || (f.entityType === 'tasks' ? f.entityId : '') || '',
          isCommentFile: f.isCommentFile === true,
          createdOn: f.createdOn || '',
          createdBy: f.createdBy || f.author?.id || '',
          versions: f.versions || [],
        })));
        await sleep(200);
      }
      anhaenge = await ladeAnhaenge({ base44, apiBase, apiKey, files, projektNamen, fehler });
    }

    // ---- awork-Dokumente als Markdown
    let dokus = { dokumente: [], abgelegt: [] };
    if (include.includes('documents')) {
      dokus = await ladeDokumente({ base44, awork, apiBase, apiKey, projects, fehler });
    }

    // ---- Stammdaten: IMMER vollständig
    let users = [], companies = [], typeofwork = [], projecttemplates = [];
    if (include.includes('stammdaten')) {
      users = (await awork.holeSeitenweise('/users', { pageSize: 500, maxSeiten: 20 })).rows;
      companies = (await awork.holeSeitenweise('/companies', { pageSize: 500, maxSeiten: 60 })).rows;
      typeofwork = (await awork.hole('/typeofwork')) || [];
      projecttemplates = (await awork.hole('/projecttemplates')) || [];
    }

    // ---- Dateien erzeugen und ablegen
    const praefix = `awork-archiv-${heute}${jahr ? `-${jahr}` : ''}`;
    const dateien = [];
    const zeilenJeDatei = {};

    const ablegen = async (name, inhalt, zeitraumbegrenzt) => {
      const bytes = new TextEncoder().encode(inhalt);
      const zeilen = inhalt ? inhalt.split('\n').filter((z) => z.trim()).length : 0;
      zeilenJeDatei[name] = zeilen;
      const file = new File([inhalt], `${praefix}-${name}`, { type: 'text/plain' });
      const up = await base44.asServiceRole.integrations.Core.UploadFile({ file }).catch((e) => {
        fehler.push({ pfad: name, status: 0, meldung: `Upload fehlgeschlagen: ${e?.message || ''}` });
        return null;
      });
      dateien.push({
        name: `${praefix}-${name}`, zeilen, bytes: bytes.length,
        sha256: await sha256(inhalt), url: up?.file_url || '',
        zeitraumbegrenzt: !!zeitraumbegrenzt,
      });
    };

    const rohdaten = [
      ['projects.jsonl', projects, false], ['tasklists.jsonl', tasklists, false],
      ['taskstatuses.jsonl', taskstatuses, false], ['tasks.jsonl', tasks, false],
      ['timeentries.jsonl', timeentries, true], ['comments.jsonl', comments, false],
      ['files.jsonl', files, false], ['documents.jsonl', dokus.dokumente, false],
      ['users.jsonl', users, false], ['companies.jsonl', companies, false],
      ['typeofwork.jsonl', typeofwork, false], ['projecttemplates.jsonl', projecttemplates, false],
    ];
    for (const [name, rows, begrenzt] of rohdaten) {
      if (!rows.length) continue;
      await ablegen(name, jsonl(rows), begrenzt);
    }

    if (timeentries.length) await ablegen('timeentries.csv', csvBauen(TIMEENTRY_SPALTEN, timeentries, timeentryMap), true);
    if (tasks.length) await ablegen('tasks.csv', csvBauen(TASK_SPALTEN, tasks, taskMap), false);
    if (comments.length) await ablegen('comments.csv', csvBauen(COMMENT_SPALTEN, comments, commentMap), false);
    if (projects.length) await ablegen('projects.csv', csvBauen(PROJECT_SPALTEN, projects, projectMap), false);
    if (anhaenge.abgelegt.length) await ablegen('anhaenge-index.jsonl', jsonl(anhaenge.abgelegt), false);
    if (dokus.abgelegt.length) await ablegen('dokumente-index.jsonl', jsonl(dokus.abgelegt), false);

    // ---- Summen
    const minutenJeJahr = {};
    let minutenGesamt = 0;
    for (const e of timeentries) {
      const m = typeof e.duration === 'number' ? Math.round(e.duration / 60) : 0;
      minutenGesamt += m;
      const j = (e.startDateLocal || '').slice(0, 4) || 'unbekannt';
      minutenJeJahr[j] = (minutenJeJahr[j] || 0) + m;
    }
    const summen = {
      minuten_gesamt: minutenGesamt,
      minuten_je_jahr: minutenJeJahr,
      zeitbuchungen: timeentries.length,
      projekte: projects.length,
      aufgaben: tasks.length,
      kommentare: comments.length,
      nutzer: users.length,
      firmen: companies.length,
      anhaenge: anhaenge.abgelegt.length,
      anhaenge_volumen_bytes: anhaenge.volumen,
      dokumente: dokus.abgelegt.length,
    };

    // ---- Vollständigkeitsprüfung: gegenzählen über eigene Abrufe
    const abweichungen = [];
    const pruefe = async (bezeichnung, pfad, geschrieben, pageSize = 500) => {
      const r = await awork.holeSeitenweise(pfad, { pageSize, maxSeiten: 60 });
      const soll = r.rows.length;
      if (r.limitErreicht || soll !== geschrieben) {
        abweichungen.push({ objektart: bezeichnung, erwartet: soll, geschrieben });
      }
      await sleep(200);
    };
    if (include.includes('stammdaten')) {
      await pruefe('users', '/users', users.length);
      await pruefe('companies', '/companies', companies.length);
      const tw = (await awork.hole('/typeofwork')) || [];
      if (tw.length !== typeofwork.length) abweichungen.push({ objektart: 'typeofwork', erwartet: tw.length, geschrieben: typeofwork.length });
      const pt = (await awork.hole('/projecttemplates')) || [];
      if (pt.length !== projecttemplates.length) abweichungen.push({ objektart: 'projecttemplates', erwartet: pt.length, geschrieben: projecttemplates.length });
    }
    if (brauchtProjekte) await pruefe('projects', '/projects', projects.length);
    if (include.includes('comments') && kommentareErwartet !== comments.length) {
      abweichungen.push({ objektart: 'comments', erwartet: kommentareErwartet, geschrieben: comments.length });
    }
    if (include.includes('files') && anhaenge.abgelegt.length !== files.length) {
      abweichungen.push({ objektart: 'files (Downloads)', erwartet: files.length, geschrieben: anhaenge.abgelegt.length });
    }

    const vollstaendig = fehler.length === 0 && abweichungen.length === 0;
    const status = vollstaendig ? 'success' : 'unvollstaendig';

    // ---- Teilläufe (jahrweise Exporte) im Manifest zusammenführen
    const frueher = await base44.asServiceRole.entities.AworkSyncLog
      .filter({ sync_type: 'archive_export' }, '-started_at', 20).catch(() => []);
    const teillaeufe = frueher
      .filter((l) => l.id !== syncLog?.id && l.status !== 'running')
      .map((l) => ({ started_at: l.started_at, status: l.status, datensaetze: l.records_fetched || 0 }));

    const manifest = {
      export_utc: new Date().toISOString(),
      export_lokal: new Date().toLocaleString('de-AT', { timeZone: 'Europe/Vienna' }),
      teillauf_jahr: jahr,
      zeitraum_nur_fuer_zeitbuchungen: { from, to },
      include,
      ausgefuehrt_von: user.full_name || user.email,
      status,
      dateien,
      summen,
      hinweise,
      abweichungen,
      fehlgeschlagene_abrufe: fehler,
      teillaeufe,
      anhaenge: anhaenge.abgelegt,
      dokumente: dokus.abgelegt,
      wichtig: 'Der Zeitraum begrenzt ausschliesslich die Zeitbuchungen. Alle anderen Objektarten sind vollständig gezogen. Die JSONL-Dateien sind die Wahrheit, die CSV ist Lesefassung.',
    };

    const manifestTxt = [
      'awork Archiv-Export',
      `Status: ${status.toUpperCase()}${vollstaendig ? '' : ' — dieser Lauf ist KEIN vollständiger Beleg'}`,
      `Export UTC: ${manifest.export_utc} · lokal: ${manifest.export_lokal}`,
      `Zeitbuchungen-Zeitraum: ${from} bis ${to}${jahr ? ` (Teillauf ${jahr})` : ''} · ausgeführt von: ${manifest.ausgefuehrt_von}`,
      '',
      'Dateien (Zeilen · Bytes · SHA-256 · Zeitraumbegrenzung):',
      ...dateien.map((d) => `  ${d.name}  ${d.zeilen} · ${d.bytes} · ${d.sha256} · ${d.zeitraumbegrenzt ? 'zeitraumbegrenzt' : 'vollständig'}\n    ${d.url || 'kein Upload'}`),
      '',
      `Zeitbuchungen: ${summen.zeitbuchungen} · Minuten gesamt: ${minutenGesamt}`,
      ...Object.entries(minutenJeJahr).sort().map(([j, m]) => `  ${j}: ${m} Minuten`),
      `Projekte: ${summen.projekte} · Aufgaben: ${summen.aufgaben} · Kommentare: ${summen.kommentare} · Nutzer: ${summen.nutzer} · Firmen: ${summen.firmen}`,
      `Anhänge: ${summen.anhaenge} Dateien · ${summen.anhaenge_volumen_bytes} Bytes · Dokumente: ${summen.dokumente}`,
      '',
      abweichungen.length
        ? `Abweichungen der Gegenzählung:\n${abweichungen.map((a) => `  ${a.objektart}: erwartet ${a.erwartet}, geschrieben ${a.geschrieben}`).join('\n')}`
        : 'Gegenzählung: keine Abweichung',
      hinweise.length ? `Hinweise:\n${hinweise.map((h) => '  ' + h).join('\n')}` : 'Hinweise: keine',
      fehler.length
        ? `Fehlgeschlagene Abrufe (${fehler.length}):\n${fehler.map((f) => `  ${f.pfad} — ${f.status} ${f.meldung}`).join('\n')}`
        : 'Fehlgeschlagene Abrufe: keine',
      '',
      teillaeufe.length ? `Frühere Läufe:\n${teillaeufe.map((t) => `  ${t.started_at} — ${t.status} — ${t.datensaetze} Datensätze`).join('\n')}` : 'Frühere Läufe: keine',
      '',
      manifest.wichtig,
    ].join('\n');

    for (const [name, inhalt] of [['manifest.json', JSON.stringify(manifest, null, 2)], ['manifest.txt', manifestTxt]]) {
      const file = new File([inhalt], `${praefix}-${name}`, { type: 'text/plain' });
      const up = await base44.asServiceRole.integrations.Core.UploadFile({ file }).catch(() => null);
      dateien.push({
        name: `${praefix}-${name}`, zeilen: inhalt.split('\n').length,
        bytes: new TextEncoder().encode(inhalt).length, sha256: await sha256(inhalt),
        url: up?.file_url || '', zeitraumbegrenzt: false,
      });
    }

    if (syncLog?.id) {
      await base44.asServiceRole.entities.AworkSyncLog.update(syncLog.id, {
        finished_at: new Date().toISOString(),
        status,
        records_fetched: projects.length + tasks.length + timeentries.length + comments.length + files.length,
        records_failed: fehler.length + abweichungen.length,
        errors: fehler.length || abweichungen.length
          ? JSON.stringify({ fehler, abweichungen }).slice(0, 500) : '',
        notes: manifestTxt.slice(0, 12000),
      }).catch(() => {});
    }

    return Response.json({
      ok: true, status, vollstaendig, dateien, summen,
      abweichungen, fehlgeschlagene_abrufe: fehler, hinweise, teillauf_jahr: jahr,
    });
  } catch (error) {
    if (syncLog?.id) {
      await base44.asServiceRole.entities.AworkSyncLog.update(syncLog.id, {
        finished_at: new Date().toISOString(),
        status: 'unvollstaendig',
        errors: String(error?.message || error).slice(0, 500),
        notes: 'Lauf abgebrochen — Ergebnis ist KEIN vollständiger Beleg.',
      }).catch(() => {});
    }
    return Response.json({ error: error?.message || 'Archiv-Export fehlgeschlagen' }, { status: 500 });
  }
}