import { sleep } from './aworkFetch.js';

const sauber = (s) => String(s || '').replace(/[^\w.\-äöüÄÖÜß ]+/g, '_').trim() || 'unbenannt';

export async function sha256(dataOderText) {
  const bytes = typeof dataOderText === 'string' ? new TextEncoder().encode(dataOderText) : dataOderText;
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Rohdownload einer awork-Datei — bei 429 verdoppelte Pause, fünf Versuche.
async function ladeBytes(apiBase, apiKey, fileId, fehler) {
  let pause = 500;
  for (let versuch = 1; versuch <= 5; versuch++) {
    const resp = await fetch(`${apiBase.replace(/\/$/, '')}/api/v1/files/${fileId}/download`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (resp.ok) return new Uint8Array(await resp.arrayBuffer());
    await resp.body?.cancel().catch(() => {});
    if (resp.status === 429 || resp.status >= 500) { pause *= 2; await sleep(pause); continue; }
    fehler.push({ pfad: `/files/${fileId}/download`, status: resp.status, meldung: 'Download abgewiesen' });
    return null;
  }
  fehler.push({ pfad: `/files/${fileId}/download`, status: 429, meldung: 'Download nach fünf Versuchen aufgegeben' });
  return null;
}

// Lädt alle Anhänge der übergebenen Datei-Metadaten herunter und legt sie einzeln ab.
// Ablagepfad: {projektname}/{taskId oder 'projekt'}/{originalname}, bei Namensgleichheit
// wird die fileId angehängt — es wird nie etwas überschrieben.
export async function ladeAnhaenge({ base44, apiBase, apiKey, files, projektNamen, fehler }) {
  const belegt = new Set();
  const abgelegt = [];
  let volumen = 0;

  for (const f of files) {
    const bytes = await ladeBytes(apiBase, apiKey, f.id, fehler);
    await sleep(500);
    if (!bytes) continue;

    const projekt = sauber(projektNamen[f.projectId] || f.projectId || 'ohne-projekt');
    const ordner = f.taskId ? sauber(f.taskId) : 'projekt';
    let name = sauber(f.fileName || f.name || f.id);
    let pfad = `${projekt}/${ordner}/${name}`;
    if (belegt.has(pfad)) {
      const punkt = name.lastIndexOf('.');
      name = punkt > 0 ? `${name.slice(0, punkt)}-${f.id}${name.slice(punkt)}` : `${name}-${f.id}`;
      pfad = `${projekt}/${ordner}/${name}`;
    }
    belegt.add(pfad);

    const file = new File([bytes], pfad.replace(/\//g, '__'), { type: f.mimeType || 'application/octet-stream' });
    const up = await base44.asServiceRole.integrations.Core.UploadFile({ file }).catch((e) => {
      fehler.push({ pfad, status: 0, meldung: `Upload fehlgeschlagen: ${e?.message || ''}` });
      return null;
    });
    volumen += bytes.length;
    abgelegt.push({
      file_id: f.id, pfad, bytes: bytes.length, sha256: await sha256(bytes), url: up?.file_url || '',
    });
  }

  return { abgelegt, volumen };
}

// awork-Dokumente sind keine Anhänge — Inhalt als Markdown ziehen und als .md ablegen.
export async function ladeDokumente({ base44, awork, apiBase, apiKey, projects, fehler }) {
  const dokumente = [];
  const abgelegt = [];

  for (const p of projects) {
    const docs = await awork.hole(`/projects/${p.id}/documents`);
    await sleep(200);
    if (!docs) continue;
    for (const d of docs) {
      dokumente.push({ ...d, _projectId: p.id, _projectName: p.name });
      const resp = await fetch(`${apiBase.replace(/\/$/, '')}/api/v1/documents/${d.id}/content?format=markdown`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      await sleep(500);
      if (!resp.ok) {
        await resp.body?.cancel().catch(() => {});
        fehler.push({ pfad: `/documents/${d.id}/content`, status: resp.status, meldung: 'Dokumentinhalt nicht abrufbar' });
        continue;
      }
      const text = await resp.text();
      const pfad = `${sauber(p.name)}/dokumente/${sauber(d.name || d.id)}.md`;
      const file = new File([text], pfad.replace(/\//g, '__'), { type: 'text/markdown' });
      const up = await base44.asServiceRole.integrations.Core.UploadFile({ file }).catch(() => null);
      abgelegt.push({
        document_id: d.id, pfad, bytes: new TextEncoder().encode(text).length,
        sha256: await sha256(text), url: up?.file_url || '',
      });
    }
  }

  return { dokumente, abgelegt };
}