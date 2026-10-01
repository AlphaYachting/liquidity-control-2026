import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  darfVerwalten, wirksamerBeginn, ladeStichtag, monateZwischen, tagDavor,
  appStunden, r2,
} from '../../shared/kontingentLaufzeit.js';

// Bisherige Retainer-Periode abschließen und eine neue beginnen.
// Eingabe { project_id, neuer_beginn, uebertrag }. Schreibt nur auf Project.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!darfVerwalten(user)) return Response.json({ error: 'Verboten — nur GF/PM' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    if (!body.project_id) return Response.json({ error: 'project_id fehlt' }, { status: 400 });
    if (!body.neuer_beginn) return Response.json({ error: 'neuer_beginn fehlt' }, { status: 400 });

    const db = base44.asServiceRole.entities;
    const project = await db.Project.get(body.project_id);
    if (!project) return Response.json({ error: 'Projekt nicht gefunden' }, { status: 404 });

    const altResult = await wirksamerBeginn(db, project);
    const alt = altResult.beginn;
    if (!alt || body.neuer_beginn <= alt) {
      return Response.json({ error: 'kein Periodenwechsel' }, { status: 400 });
    }

    const ende = tagDavor(body.neuer_beginn);
    const stichtag = await ladeStichtag(db);
    const kontingent = Number(project.support_kontingent_stunden) || 0;
    const uebertrag = Number(project.kontingent_uebertrag_stunden) || 0;
    const monate = monateZwischen(alt, ende);
    const verfuegbar = monate * kontingent + uebertrag;

    // Gebucht = aWork-Altstand (manuell übertragen, alt bis Stichtag) + App (alt bis ende, nach stichtag)
    const gebucht_awork = alt <= stichtag
      ? Number(project.awork_altstand_stunden) || 0
      : 0;
    const gebucht_app = await appStunden(db, project.id, { beginn: alt, ende, stichtag });
    const gebucht = r2(gebucht_awork + gebucht_app);
    const saldo = r2(verfuegbar - gebucht);

    const historieEintrag = {
      beginn: alt,
      ende,
      monate,
      kontingent_monat: kontingent,
      uebertrag: r2(uebertrag),
      verfuegbar: r2(verfuegbar),
      gebucht,
      saldo,
      abgeschlossen_am: new Date().toISOString(),
    };

    const historie = [
      ...(Array.isArray(project.laufzeit_historie) ? project.laufzeit_historie : []),
      historieEintrag,
    ];

    // Neue Periode setzen + aWork-Altstand für neue Periode initialisieren
    await db.Project.update(body.project_id, {
      laufzeit_beginn: body.neuer_beginn,
      laufzeit_beginn_quelle: 'manuell',
      kontingent_uebertrag_stunden: Number(body.uebertrag) || 0,
      laufzeit_historie: historie,
      awork_altstand_stunden: body.neuer_beginn > stichtag ? 0 : null,
      awork_altstand_beginn: body.neuer_beginn > stichtag ? body.neuer_beginn : null,
    });

    return Response.json({
      abgeschlossen: historieEintrag,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
