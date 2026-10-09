import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { wienTag, modusFuer } from '../../shared/arbeitszeitKern.js';
import { ladeEinstellungen } from '../../shared/arbeitszeitDaten.js';
import { monatsAuskunft } from '../../shared/arbeitszeitMonat.js';
import { antragStellen, antragZurueckziehen, antraegeEntscheiden } from '../../shared/arbeitszeitAntraege.js';

// Die Aufzeichnungsseite „Meine Arbeitszeit“ und die Anträge — eine Funktion, eine Aktion je Aufruf.
//   { aktion: 'monat', monat?: 'YYYY-MM', person_email? (nur Genehmiger) }
//   { aktion: 'stellen', antrag_id? | ziel, art, ziel_id?, tag, nachher, grund, vorgang_id }
//   { aktion: 'zurueckziehen', antrag_id }
//   { aktion: 'entscheiden', ids, entscheidung: 'genehmigt'|'abgelehnt', kommentar }  — nur Genehmiger
// Es gibt kein manuelles Eintragen: Jede Änderung ist ein Antrag und wirkt erst nach Genehmigung.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const [user, eingabe] = await Promise.all([base44.auth.me(), req.json().catch(() => ({}))]);
    if (!user?.email) return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 });
    const email = String(user.email).toLowerCase();
    const db = base44.asServiceRole.entities;
    const aktion = eingabe?.aktion;

    if (aktion === 'monat') return Response.json(await monatsAuskunft(db, email, eingabe));

    if (aktion === 'stellen') {
      const einst = await ladeEinstellungen(db);
      const tag = String(eingabe.tag || '') || wienTag(new Date());
      const modus = modusFuer(email, tag, einst);
      if (!modus.neu) return Response.json({ fehler: 'Für diesen Tag gilt die neue Erfassung noch nicht' }, { status: 409 });
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
