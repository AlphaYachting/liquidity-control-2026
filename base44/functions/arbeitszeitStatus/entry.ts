import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { wienTag, darfGenehmigen, modusFuer } from '../../shared/arbeitszeitKern.js';
import { ladeEinstellungen, ladeStempel, automatikNachziehen, timerAufraeumen, nachweisNeu, statusAntwort } from '../../shared/arbeitszeitDaten.js';

// Stand der angemeldeten Person für Kopfzeile und Tagesansicht. Nur lesend — mit einer Ausnahme:
// Ist ein automatisches Gehen fällig und noch nicht festgeschrieben (z. B. Browser über Nacht
// offen, Zeitplanlauf ausgefallen), wird es hier nachgezogen. Das ist wiederholbar.
// Im alten Modus: { aktiv: false } nach einer einzigen Abfrage.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.email) return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 });
    const email = String(user.email).toLowerCase();
    const db = base44.asServiceRole.entities;
    const einst = await ladeEinstellungen(db);

    const jetztIso = new Date().toISOString();
    const tag = wienTag(jetztIso);
    const modus = modusFuer(email, tag, einst);
    if (!modus.neu) return Response.json({ aktiv: false, jetzt: jetztIso, tag });

    if (modus.stempelt) {
      const stempel = await ladeStempel(db, email, tag);
      if (await automatikNachziehen(db, email, tag, stempel, jetztIso)) await nachweisNeu(db, email, tag, einst);
      await timerAufraeumen(db, email, jetztIso);
    }
    return Response.json(await statusAntwort(db, email, einst, { istGenehmiger: darfGenehmigen(email, einst) }));
  } catch (error) {
    return Response.json({ fehler: error?.message || String(error) }, { status: 500 });
  }
}
