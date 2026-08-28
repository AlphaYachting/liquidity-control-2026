import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { baueEineZeile } from '../../shared/searchIndexBuild.js';

// Eine einzelne Zeile nach dem Speichern auffrischen. Die Index-Version bleibt
// unberührt — die Delta-Abfrage über updated_date holt die Zeile ohnehin.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { entity, id } = await req.json();
    if (!entity || !id) return Response.json({ error: 'entity und id sind nötig' }, { status: 400 });

    const sr = base44.asServiceRole;
    const zeile = await baueEineZeile(sr, entity, id);
    const vorhanden = await sr.entities.SearchIndexEntry.filter({ ref_entity: entity, ref_id: id }, '-created_date', 1);

    if (!zeile) {
      if (vorhanden[0]) await sr.entities.SearchIndexEntry.update(vorhanden[0].id, { is_active: false });
      return Response.json({ ok: true, aktion: 'deaktiviert' });
    }
    if (vorhanden[0]) {
      await sr.entities.SearchIndexEntry.update(vorhanden[0].id, zeile);
      return Response.json({ ok: true, aktion: 'aktualisiert' });
    }
    await sr.entities.SearchIndexEntry.create(zeile);
    return Response.json({ ok: true, aktion: 'angelegt' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}