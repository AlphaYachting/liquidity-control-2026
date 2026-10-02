import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { baueAlleZeilen } from '../../shared/searchIndexBuild.js';

async function setzeSetting(sr, key, value, label) {
  const rows = await sr.entities.Setting.filter({ key }, '-created_date', 1);
  if (rows[0]) {
    await sr.entities.Setting.update(rows[0].id, { value: String(value) });
    return;
  }
  await sr.entities.Setting.create({ key, value: String(value), group: 'kapazitaet', label });
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;
    // Nächtlich läuft die Funktion ohne Nutzer; manuell nur für Administratoren.
    let user = null;
    try { user = await base44.auth.me(); } catch (e) { user = null; }
    const geplant = !user;
    if (!geplant && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const zeilen = await baueAlleZeilen(sr);

    // Ohne Leerfenster: zuerst die Ids des alten Stands merken, dann den neuen
    // Stand schreiben, erst danach den alten löschen. Die Suche hat so in jedem
    // Moment einen vollständigen Index.
    const alteIds = [];
    for (let seite = 0; seite < 60; seite++) {
      const teil = await sr.entities.SearchIndexEntry.list('-created_date', 500, seite * 500);
      if (!teil.length) break;
      teil.forEach((z) => alteIds.push(z.id));
      if (teil.length < 500) break;
    }

    for (let i = 0; i < zeilen.length; i += 200) {
      await sr.entities.SearchIndexEntry.bulkCreate(zeilen.slice(i, i + 200));
    }

    let geloescht = 0;
    for (let i = 0; i < alteIds.length; i += 500) {
      const teil = alteIds.slice(i, i + 500);
      await sr.entities.SearchIndexEntry.deleteMany({ id: { $in: teil } });
      geloescht += teil.length;
    }

    // Die Version steigt erst am Ende: alle Zwischenspeicher im Browser holen
    // danach den vollständigen neuen Stand.
    const versionRows = await sr.entities.Setting.filter({ key: 'search_index_version' }, '-created_date', 1);
    const version = (Number(versionRows[0]?.value) || 0) + 1;
    await setzeSetting(sr, 'search_index_version', version, 'Version des Suchindex');
    await setzeSetting(sr, 'search_index_built_at', new Date().toISOString(), 'Letzter Aufbau des Suchindex');

    return Response.json({ ok: true, geschrieben: zeilen.length, geloescht, version });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
