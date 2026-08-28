import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const GELD_FELDER = ['side', 'side_note', 'card'];

async function profil(sr, email) {
  const rows = await sr.entities.TeamMemberProfile.filter({ user_email: email }, '-created_date', 1);
  return rows[0] || null;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const sr = base44.asServiceRole;

    let since = null;
    try { since = (await req.json())?.since || null; } catch (e) { since = null; }

    const p = await profil(sr, user.email);
    const scope = p ? p.data_scope : (user.role === 'admin' ? 'all' : 'own');
    const areas = p?.work_areas?.length
      ? p.work_areas
      : (user.role === 'admin'
        ? ['projects', 'sales', 'backoffice', 'management', 'intelligence']
        : ['projects']);
    const darfGeld = areas.includes('backoffice') || areas.includes('management');

    const versionRows = await sr.entities.Setting.filter({ key: 'search_index_version' }, '-created_date', 1);
    const version = Number(versionRows[0]?.value) || 0;

    // Alle Zeilen seitenweise lesen, damit der Speicher nicht überläuft.
    const roh = [];
    for (let seite = 0; seite < 40; seite++) {
      const teil = await sr.entities.SearchIndexEntry.list('-updated_date', 500, seite * 500);
      if (!teil.length) break;
      roh.push(...teil);
      if (teil.length < 500) break;
      // Bei einer Delta-Abfrage genügen die neuesten Seiten.
      if (since && teil[teil.length - 1].updated_date <= since) break;
    }

    const entfernt = [];
    const zeilen = [];
    for (const z of roh) {
      if (since && z.updated_date <= since) continue;
      const sichtbar = areas.includes(z.area)
        && z.is_active !== false
        && !(scope === 'own' && z.owner_email && z.owner_email !== user.email);
      if (!sichtbar) { if (since) entfernt.push(z.id); continue; }

      const zeile = {
        id: z.id,
        entry_type: z.entry_type,
        ref_entity: z.ref_entity,
        ref_id: z.ref_id,
        client_id: z.client_id,
        client_name: z.client_name,
        title: z.title,
        subtitle: z.subtitle,
        side: darfGeld ? (z.side || '') : '',
        side_note: darfGeld ? (z.side_note || '') : '',
        is_due: darfGeld ? !!z.is_due : false,
        haystack: z.haystack,
        area: z.area,
        route: z.route,
        activity_at: z.activity_at,
        weight: z.weight,
        card: darfGeld ? (z.card || []) : (z.card_team || []),
        updated_date: z.updated_date,
      };
      zeilen.push(zeile);
    }

    return Response.json({ version, zeilen, entfernt, voll: !since, stand: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}