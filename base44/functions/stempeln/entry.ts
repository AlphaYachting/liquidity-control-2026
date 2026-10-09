import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { darfGenehmigen } from '../../shared/arbeitszeitKern.js';
import { ladeEinstellungen, stempelnAblauf, statusAntwort } from '../../shared/arbeitszeitDaten.js';

// Kommen, Pause, Pause beenden, Gehen — immer für die angemeldete Person, immer zur Serverzeit.
// Eingabe: { art: 'kommen'|'pause_start'|'pause_ende'|'gehen', vorgang_id, erwartet?, notiz? }
//   vorgang_id — vom Browser je Knopfdruck erzeugt; derselbe Vorgang wird nur einmal gestempelt
//   erwartet   — Zustand, den der Browser angezeigt hat; weicht er ab, wird nichts gestempelt (409)
//   notiz      — Beschreibung für einen dabei gestoppten Timer
// Der Ablauf selbst steht in base44/shared/arbeitszeitDaten.js (stempelnAblauf), geprüft in
// tests/arbeitszeitAblauf.test.mjs.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.email) return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 });
    const email = String(user.email).toLowerCase();
    const eingabe = await req.json().catch(() => ({}));
    const db = base44.asServiceRole.entities;
    const einst = await ladeEinstellungen(db);

    const { status, extra, ohneStand } = await stempelnAblauf(db, email, einst, eingabe || {});
    if (ohneStand) return Response.json(extra, { status });
    const stand = await statusAntwort(db, email, einst, { istGenehmiger: darfGenehmigen(email, einst) });
    return Response.json({ ...stand, ...extra }, { status });
  } catch (error) {
    return Response.json({ fehler: error?.message || String(error) }, { status: 500 });
  }
}
