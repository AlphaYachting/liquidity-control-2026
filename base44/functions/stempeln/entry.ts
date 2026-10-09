import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { stempelnAblauf } from '../../shared/arbeitszeitDaten.js';

// Kommen, Pause, Pause beenden, Gehen — immer für die angemeldete Person, immer zur Serverzeit.
// Eingabe: { art: 'kommen'|'pause_start'|'pause_ende'|'gehen', vorgang_id, erwartet?, notiz? }
//   vorgang_id — vom Browser je Knopfdruck erzeugt; derselbe Vorgang wird nur einmal gestempelt
//   erwartet   — Zustand, den der Browser angezeigt hat; weicht er ab, wird nichts gestempelt (409)
//   notiz      — Beschreibung für einen dabei gestoppten Timer
// Antwort: der neue Stand (wie arbeitszeitStatus) plus ok/fehler/gebucht — im Speicher berechnet,
// ohne zweites Laden. Ablauf und Prüffälle: base44/shared/arbeitszeitDaten.js (stempelnAblauf),
// tests/arbeitszeitAblauf.test.mjs.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const [user, eingabe] = await Promise.all([base44.auth.me(), req.json().catch(() => ({}))]);
    if (!user?.email) return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 });
    const email = String(user.email).toLowerCase();
    const db = base44.asServiceRole.entities;

    const { status, extra, stand, ohneStand } = await stempelnAblauf(db, email, null, eingabe || {});
    return Response.json(ohneStand ? extra : { ...stand, ...extra }, { status });
  } catch (error) {
    return Response.json({ fehler: error?.message || String(error) }, { status: 500 });
  }
}
