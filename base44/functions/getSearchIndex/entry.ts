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
  // Vertrieb (CRM-Deals, Angebote) sehen neben dem Vertrieb auch Management und
  // Verwaltung — sie brauchen den direkten Weg zum Lead bzw. Deal.
  const darfBereich = (area) => areas.includes(area) || (area === 'sales' && darfGeld);

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
      // „Eigene“: die Person steht unter den Zuständigen (Liste, sonst Einzelfeld)
      const ich = String(user.email || '').trim().toLowerCase();
      const besitzer = Array.isArray(z.owner_emails) && z.owner_emails.length
        ? z.owner_emails.map((e) => String(e || '').trim().toLowerCase())
        : (z.owner_email ? [String(z.owner_email).trim().toLowerCase()] : []);
      const sichtbar = darfBereich(z.area)
        && z.is_active !== false
        && !(scope === 'own' && besitzer.length && !besitzer.includes(ich));
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
        // Cockpit-Verweis am Projekt nur mit Finanzrecht.
        route_cockpit: darfGeld ? (z.route_cockpit || '') : '',
        owner_email: z.owner_email || '',
        owner_emails: besitzer,
        kuerzel: z.kuerzel || '',
        ist_erledigt: !!z.ist_erledigt,
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