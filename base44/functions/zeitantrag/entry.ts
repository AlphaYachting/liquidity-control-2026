import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { wienTag, modusFuer, darfGenehmigen } from '../../shared/arbeitszeitKern.js';
import { ladeEinstellungen } from '../../shared/arbeitszeitDaten.js';
import { antragStellen, antragZurueckziehen, antraegeEntscheiden } from '../../shared/arbeitszeitAntraege.js';

// Anträge zur Anwesenheit (Kommen, Pause, Gehen) für „Meine Zeiten“. Projektbuchungen laufen
// weiterhin direkt über „Meine Zeiten“ — hier geht es nur um Stempel und die Klärfälle der Automatik.
//   { aktion: 'liste' }                         — eigene Anträge und Klärfälle; für Genehmiger alle offenen
//   { aktion: 'stellen', antrag_id? | ziel: 'stempel', art, ziel_id?, tag, nachher, grund, vorgang_id }
//   { aktion: 'zurueckziehen', antrag_id }
//   { aktion: 'entscheiden', ids, entscheidung: 'genehmigt'|'abgelehnt', kommentar } — nur Genehmiger
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const [user, eingabe] = await Promise.all([base44.auth.me(), req.json().catch(() => ({}))]);
    if (!user?.email) return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 });
    const email = String(user.email).toLowerCase();
    const db = base44.asServiceRole.entities;
    const aktion = eingabe?.aktion;

    if (aktion === 'liste') {
      const einst = await ladeEinstellungen(db);
      const genehmiger = darfGenehmigen(email, einst);
      const [eigene, offenAlle, team] = await Promise.all([
        db.Zeitantrag.filter({ person_email: email }, '-created_date', 100).catch(() => []),
        genehmiger ? db.Zeitantrag.filter({ status: 'offen' }, 'created_date', 300).catch(() => []) : Promise.resolve([]),
        genehmiger ? db.TeamMember.filter({ active: true }, 'name', 100).catch(() => []) : Promise.resolve([]),
      ]);
      const name = Object.fromEntries(team.map((m) => [String(m.email || '').toLowerCase(), m.name]));
      return Response.json({
        genehmiger,
        eigene,
        ...(genehmiger ? { offenAlle: offenAlle.map((a) => ({ ...a, person_name: name[a.person_email] || a.person_email })) } : {}),
      });
    }

    if (aktion === 'stellen') {
      const einst = await ladeEinstellungen(db);
      const tag = String(eingabe.tag || '') || wienTag(new Date());
      const modus = modusFuer(email, tag, einst);
      if (!modus.neu) return Response.json({ fehler: 'Für diesen Tag gilt die Anwesenheitserfassung noch nicht' }, { status: 409 });
      const r = await antragStellen(db, email, eingabe, new Date(), { stempelt: modus.stempelt });
      return Response.json(r, { status: r.fehler ? 422 : 200 });
    }

    if (aktion === 'zurueckziehen') {
      const r = await antragZurueckziehen(db, email, eingabe.antrag_id);
      return Response.json(r, { status: r.fehler ? 422 : 200 });
    }

    if (aktion === 'entscheiden') {
      const r = await antraegeEntscheiden(db, email, eingabe);
      return Response.json(r, { status: r.fehler ? 403 : 200 });
    }

    return Response.json({ fehler: 'Unbekannte Aktion' }, { status: 400 });
  } catch (error) {
    return Response.json({ fehler: error?.message || String(error) }, { status: 500 });
  }
}
