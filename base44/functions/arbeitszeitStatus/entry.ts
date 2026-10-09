import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { statusAbfrage } from '../../shared/arbeitszeitDaten.js';

// Stand der angemeldeten Person für Kopfzeile und Tagesansicht. Eine parallele Leserunde.
// Nur bei Fälligkeit (Gehen vergessen, Browser über Nacht offen, Zeitplanlauf ausgefallen,
// Timer außerhalb der Anwesenheit ab Stichtag) wird nachgezogen — wiederholbar.
// Im alten Modus: { aktiv: false }.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.email) return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 });
    const email = String(user.email).toLowerCase();
    return Response.json(await statusAbfrage(base44.asServiceRole.entities, email));
  } catch (error) {
    return Response.json({ fehler: error?.message || String(error) }, { status: 500 });
  }
}
