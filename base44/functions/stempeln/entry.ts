import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { wienTag, spieleAb, erlaubt, zustandJetzt, modusFuer, darfGenehmigen } from '../../shared/arbeitszeitKern.js';
import {
  ladeEinstellungen, ladeStempel, stempelZuVorgang, automatikNachziehen, konflikteBereinigen,
  nachweisNeu, statusAntwort,
} from '../../shared/arbeitszeitDaten.js';
import { laufendeVon, timerVerbuchen } from '../../shared/zeitBuchung.js';

// Kommen, Pause, Pause beenden, Gehen — immer für die angemeldete Person, immer zur Serverzeit.
// Eingabe: { art: 'kommen'|'pause_start'|'pause_ende'|'gehen', vorgang_id, erwartet?, notiz? }
//   vorgang_id — vom Browser je Knopfdruck erzeugt; derselbe Vorgang wird nur einmal gestempelt
//   erwartet   — Zustand, den der Browser angezeigt hat; weicht er ab, wird nichts gestempelt (409)
//   notiz      — Beschreibung für einen dabei gestoppten Timer
// Reihenfolge: Automatik nachziehen → prüfen → laufenden Timer buchen → Stempel → nachlesen → Nachweis.
const ARTEN = ['kommen', 'pause_start', 'pause_ende', 'gehen'];

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.email) return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 });
    const email = String(user.email).toLowerCase();
    const { art, vorgang_id, erwartet, notiz = '' } = await req.json().catch(() => ({}));
    if (!ARTEN.includes(art)) return Response.json({ fehler: 'Unbekannte Art' }, { status: 400 });

    const db = base44.asServiceRole.entities;
    const einst = await ladeEinstellungen(db);
    const istGenehmiger = darfGenehmigen(email, einst);
    const antwort = async (extra = {}, status = 200) =>
      Response.json({ ...(await statusAntwort(db, email, einst, { istGenehmiger })), ...extra }, { status });

    const jetzt = new Date();
    const jetztIso = jetzt.toISOString();
    const tag = wienTag(jetzt);
    const modus = modusFuer(email, tag, einst);
    if (!modus.neu) return Response.json({ fehler: 'nicht_aktiv' }, { status: 409 });
    if (!modus.stempelt) return Response.json({ fehler: 'stempelt_nicht' }, { status: 400 });

    // Wiederholung desselben Knopfdrucks: nichts Neues, aktueller Stand zurück.
    if (await stempelZuVorgang(db, email, vorgang_id)) return antwort({ ok: true, wiederholt: true });

    let stempel = await ladeStempel(db, email, tag);
    if (await automatikNachziehen(db, email, tag, stempel, jetztIso)) stempel = await ladeStempel(db, email, tag);

    const zustand = zustandJetzt(stempel, jetztIso).zustand;
    if (erwartet && erwartet !== zustand) return antwort({ fehler: 'veraltet' }, 409);
    if (!erlaubt(zustand, art)) return antwort({ fehler: 'nicht_moeglich' }, 409);

    // Pause und Gehen stoppen einen laufenden Timer — vor dem Stempel, damit nie ein Timer
    // in einer Pause weiterläuft. Bei Wiederholung erkennt timerVerbuchen die Buchung wieder.
    let gebucht = null;
    if (art === 'pause_start' || art === 'gehen') {
      const laufende = await laufendeVon(db, email);
      if (laufende) {
        const r = await timerVerbuchen(db, laufende, { notiz, endeIso: jetztIso, tag: wienTag(laufende.gestartet_am) });
        gebucht = { id: r.eintrag.id, minuten: r.eintrag.duration_minutes, project_id: r.eintrag.project_id, projekt_titel: laufende.projekt_titel || '' };
      }
    }

    const neu = await db.Stempel.create({
      person_email: email, tag, art, zeit: jetztIso, quelle: 'knopf', status: 'gueltig',
      vorgang_id: vorgang_id || undefined, erfasst_von: email,
    });

    // Nachlesen: zwei Fenster gleichzeitig? Der erste Stempel gewinnt, der zweite wird ungültig.
    stempel = await ladeStempel(db, email, tag);
    const konflikte = await konflikteBereinigen(db, stempel);
    if (konflikte.includes(neu.id)) return antwort({ fehler: 'veraltet', gebucht }, 409);

    await nachweisNeu(db, email, tag, einst);
    return antwort({ ok: true, art, gebucht });
  } catch (error) {
    return Response.json({ fehler: error?.message || String(error) }, { status: 500 });
  }
}
