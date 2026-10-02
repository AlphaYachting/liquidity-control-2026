import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { baueZeilen, BEKANNTE_ENTITIES } from '../../shared/searchIndexBuild.js';

// Einzelne Zeilen nach dem Speichern auffrischen. Nimmt { entity, id } oder
// { eintraege: [{ entity, id }, …] } (gebündelt aus dem Frontend, höchstens 50).
// Abhängige Zeilen (Projekt einer Aufgabe, Kunde eines Projekts) werden
// mitgefrischt. Die Index-Version bleibt unberührt — die Delta-Abfrage über
// updated_date holt die Zeilen ohnehin.
const MAX = 50;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const roh = Array.isArray(body.eintraege) ? body.eintraege : [{ entity: body.entity, id: body.id }];
    const eintraege = roh
      .filter((e) => e && e.entity && e.id && BEKANNTE_ENTITIES.includes(e.entity))
      .slice(0, MAX);
    if (!eintraege.length) return Response.json({ ok: true, aktion: 'nichts zu tun' });

    const sr = base44.asServiceRole;
    const ergebnis = await baueZeilen(sr, eintraege);
    const zaehler = { aktualisiert: 0, angelegt: 0, deaktiviert: 0 };

    for (const { entity, id, zeile } of ergebnis) {
      const vorhanden = await sr.entities.SearchIndexEntry.filter({ ref_entity: entity, ref_id: id }, '-created_date', 5);
      if (!zeile) {
        for (const v of vorhanden) {
          if (v.is_active !== false) { await sr.entities.SearchIndexEntry.update(v.id, { is_active: false }); zaehler.deaktiviert++; }
        }
        continue;
      }
      if (vorhanden[0]) {
        await sr.entities.SearchIndexEntry.update(vorhanden[0].id, zeile);
        zaehler.aktualisiert++;
        // Doppelte Zeilen desselben Datensatzes stilllegen.
        for (const v of vorhanden.slice(1)) {
          if (v.is_active !== false) await sr.entities.SearchIndexEntry.update(v.id, { is_active: false });
        }
      } else {
        await sr.entities.SearchIndexEntry.create(zeile);
        zaehler.angelegt++;
      }
    }
    return Response.json({ ok: true, ...zaehler });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
