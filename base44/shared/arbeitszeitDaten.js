// Arbeitszeit — Datenzugriff und gemeinsame Abläufe der Funktionen stempeln, arbeitszeitStatus,
// zeitStarten, zeitAntrag*, arbeitszeitAutomatik. `db` = base44.asServiceRole.entities.
import {
  EINSTELLUNG_KEYS, leseEinstellungen, modusFuer, wienTag, zustandJetzt, werteTagAus, spieleAb,
} from './arbeitszeitKern.js';
import { laufendeVon, laufendeEntfernen } from './zeitBuchung.js';

export async function ladeEinstellungen(db) {
  const rows = await db.Setting.filter({ key: { $in: EINSTELLUNG_KEYS } }, 'key', 20).catch(() => []);
  return leseEinstellungen(rows);
}

export const ladeStempel = (db, email, tag) => db.Stempel.filter({ person_email: email, tag }, 'zeit', 500);
export const ladeBuchungen = (db, email, tag) => db.TimeEntry.filter({ person_email: email, entry_date: tag }, 'started_at', 500);

export async function istAbwesend(db, email, tag) {
  const rows = await db.FocusDay.filter({ person_email: email, type: 'abwesend', day: { $lte: tag } }, '-day', 30).catch(() => []);
  return rows.some((f) => f.day <= tag && (f.until || f.day) >= tag);
}

export async function offeneAntraege(db, email, tag = null) {
  const q = { person_email: email, status: 'offen', ...(tag ? { tag } : {}) };
  return db.Zeitantrag.filter(q, '-created_date', 200).catch(() => []);
}

export async function zuKlaeren(db, email) {
  return db.Zeitantrag.filter({ person_email: email, status: 'entwurf' }, 'tag', 100).catch(() => []);
}

// Vorgang schon verarbeitet? (Wiederholung nach Netzfehler, Doppelklick)
export async function stempelZuVorgang(db, email, vorgangId) {
  if (!vorgangId) return null;
  const rows = await db.Stempel.filter({ person_email: email, vorgang_id: vorgangId }, 'created_date', 5);
  return rows[0] || null;
}

// Die Automatik zieht nach, was die Rechnung ohnehin ergibt — idempotent über vorgang_id:
// 1. fälliges „Gehen unklar“ als Stempel (quelle auto) festschreiben,
// 2. einen dabei noch laufenden Timer NICHT buchen, sondern als Entwurf „Ende angeben“ ablegen,
// 3. einen Entwurf „Gehen angeben“ für die Person anlegen.
// Gibt zurück, ob etwas geschrieben wurde.
export async function automatikNachziehen(db, email, tag, stempel, jetztIso) {
  const ab = spieleAb(stempel);
  if (ab.zustand === 'weg' || !ab.letztesKommen) return false;
  const z = zustandJetzt(stempel, jetztIso);
  if (!z.gehenUnklar || !z.autoGehenFaellig) return false;
  const kommen = ab.wirksam.filter((s) => s.art === 'kommen').pop();
  const vorgang = `auto:${kommen.id}`;

  // Timer zuerst sichern — er darf nie verloren gehen.
  const laufende = await laufendeVon(db, email);
  if (laufende && laufende.gestartet_am <= z.autoGehenFaellig) {
    await timerAlsEntwurf(db, email, laufende, z.autoGehenFaellig, 'Gehen nicht gestempelt — Timer automatisch angehalten');
  }

  if (!(await stempelZuVorgang(db, email, vorgang))) {
    await db.Stempel.create({
      person_email: email, tag, art: 'gehen', zeit: z.autoGehenFaellig,
      quelle: 'auto', status: 'gueltig', vorgang_id: vorgang, erfasst_von: 'automatik',
      status_grund: 'Gehen nicht gestempelt — automatisch beendet, Gehen unklar',
    });
  }
  const gVorgang = `gehen:${kommen.id}`;
  const g = await db.Zeitantrag.filter({ person_email: email, vorgang_id: gVorgang }, 'created_date', 1);
  if (!g[0]) {
    await db.Zeitantrag.create({
      person_email: email, tag, ziel: 'stempel', art: 'gehen_angeben', status: 'entwurf',
      vorher: { kommen: kommen.zeit, automatisch_beendet_am: z.autoGehenFaellig },
      nachher: {}, vorgang_id: gVorgang,
    });
  }
  return true;
}

// Einen laufenden Timer, dessen Ende niemand kennt, NICHT buchen, sondern als Entwurf
// „Ende angeben“ ablegen. Die Person trägt das Ende ein, Alfons genehmigt. Wiederholbar.
export async function timerAlsEntwurf(db, email, laufende, angehaltenAm, grund) {
  const tVorgang = `timer:${laufende.id}`;
  const da = await db.Zeitantrag.filter({ person_email: email, vorgang_id: tVorgang }, 'created_date', 1);
  if (!da[0]) {
    await db.Zeitantrag.create({
      person_email: email,
      tag: wienTag(laufende.gestartet_am),
      ziel: 'buchung',
      art: 'ende_angeben',
      status: 'entwurf',
      vorher: { laufende_id: laufende.id, gestartet_am: laufende.gestartet_am, automatisch_angehalten_am: angehaltenAm, hinweis: grund },
      nachher: {
        project_id: laufende.project_id,
        ticket_id: laufende.ticket_id || null,
        module_template_id: laufende.module_template_id || null,
        projekt_titel: laufende.projekt_titel || '',
        von: laufende.gestartet_am,
        bis: null,
        note: laufende.notiz || '',
      },
      vorgang_id: tVorgang,
    });
  }
  await laufendeEntfernen(db, email);
}

// Ein Timer, der außerhalb der Anwesenheit läuft (vom Vortag übrig, vor dem Stichtag gestartet,
// Gehen in einem anderen Fenster), wird zum Entwurf. Nur für Personen, die stempeln.
export async function timerAufraeumen(db, email, jetztIso) {
  const laufende = await laufendeVon(db, email);
  if (!laufende) return false;
  const tagT = wienTag(laufende.gestartet_am);
  const stempel = await ladeStempel(db, email, tagT);
  if (await automatikNachziehen(db, email, tagT, stempel, jetztIso)) return true;
  if (zustandJetzt(stempel, jetztIso).zustand === 'da') return false;
  await timerAlsEntwurf(db, email, laufende, jetztIso, 'Timer lief ohne Anwesenheit');
  return true;
}

// Widersprüchliche Stempel (zwei Tabs, gleiche Vorgangsnummer) ungültig setzen — der erste gewinnt.
export async function konflikteBereinigen(db, stempel) {
  const { konflikte } = spieleAb(stempel);
  for (const id of konflikte) {
    await db.Stempel.update(id, { status: 'ungueltig', status_grund: 'passt nicht zum Zustand davor (Doppelklick oder zweites Fenster)' }).catch(() => null);
  }
  return konflikte;
}

// Tagesstand einer Person berechnen (ohne zu schreiben).
export async function tagesstand(db, email, tag, jetztIso, einst) {
  const modus = modusFuer(email, tag, einst);
  const [stempel, buchungen, abwesend, antraege] = await Promise.all([
    ladeStempel(db, email, tag),
    ladeBuchungen(db, email, tag),
    istAbwesend(db, email, tag),
    offeneAntraege(db, email, tag),
  ]);
  const auswertung = werteTagAus({
    tag, stempel, buchungen, jetztIso, sollMin: modus.sollMin, abwesend,
    offeneAntraege: antraege.length, stempelt: modus.stempelt,
  });
  return { modus, stempel, buchungen, auswertung };
}

// Tagesnachweis schreiben (Upsert). Ein festgeschriebener Tag wird nur mit `auchFest` neu berechnet
// (Genehmigung eines Antrags, Korrektur durch Alfons).
export async function nachweisSchreiben(db, email, tag, a, { festschreiben = false, auchFest = false } = {}) {
  const rows = await db.Tagesnachweis.filter({ person_email: email, tag }, 'created_date', 10);
  const [erster, ...doppelt] = rows;
  for (const d of doppelt) await db.Tagesnachweis.delete(d.id).catch(() => null); // abgeleitete Daten
  if (erster?.status === 'fest' && !auchFest) return erster;
  const jetzt = new Date().toISOString();
  const daten = {
    person_email: email,
    tag,
    kommen: a.kommen || null,
    gehen: a.gehen || null,
    bloecke: a.bloecke,
    pausen: a.pausen,
    arbeitszeit_min: a.arbeitszeitMin,
    pause_min: a.pauseMin,
    projektzeit_min: a.projektzeitMin,
    ohne_projekt_min: a.ohneProjektMin,
    soll_min: a.sollMin,
    saldo_min: a.saldoMin,
    status: festschreiben || erster?.status === 'fest' ? 'fest' : a.status,
    offene_antraege: a.offeneAntraege || 0,
    hinweise: a.hinweise,
    berechnet_am: jetzt,
    ...(festschreiben && !erster?.festgeschrieben_am ? { festgeschrieben_am: jetzt } : {}),
  };
  return erster ? db.Tagesnachweis.update(erster.id, daten) : db.Tagesnachweis.create(daten);
}

export async function nachweisNeu(db, email, tag, einst, opts = {}) {
  const { auswertung } = await tagesstand(db, email, tag, new Date().toISOString(), einst);
  return nachweisSchreiben(db, email, tag, auswertung, opts);
}

// Antwort an den Browser: alles, was Kopfzeile und Tagesansicht brauchen.
export async function statusAntwort(db, email, einst, { istGenehmiger = false } = {}) {
  const jetztIso = new Date().toISOString();
  const tag = wienTag(jetztIso);
  const modus = modusFuer(email, tag, einst);
  if (!modus.neu) return { aktiv: false, jetzt: jetztIso, tag };
  const [{ auswertung }, laufende, entwuerfe, eigeneOffen, alleOffen] = await Promise.all([
    tagesstand(db, email, tag, jetztIso, einst),
    laufendeVon(db, email),
    zuKlaeren(db, email),
    offeneAntraege(db, email),
    istGenehmiger ? db.Zeitantrag.filter({ status: 'offen' }, 'created_date', 500).catch(() => []) : Promise.resolve(null),
  ]);
  return {
    aktiv: true,
    jetzt: jetztIso,
    tag,
    stempelt: modus.stempelt,
    pilot: modus.imPilot,
    modellFehlt: modus.modellFehlt,
    zustand: modus.stempelt ? auswertung.zustand : null,
    seit: auswertung.seit,
    gehenUnklar: auswertung.gehenUnklar,
    heute: {
      kommen: auswertung.kommen,
      gehen: auswertung.gehen,
      arbeitszeitMin: auswertung.arbeitszeitMin,
      pauseMin: auswertung.pauseMin,
      projektzeitMin: auswertung.projektzeitMin,
      ohneProjektMin: auswertung.ohneProjektMin,
      sollMin: auswertung.sollMin,
      saldoMin: auswertung.saldoMin,
      hinweise: auswertung.hinweise,
      bloecke: auswertung.bloecke,
      pausen: auswertung.pausen,
    },
    timer: laufende ? {
      id: laufende.id, project_id: laufende.project_id, ticket_id: laufende.ticket_id || null,
      projekt_titel: laufende.projekt_titel || '', kuerzel: laufende.kuerzel || '', gestartet_am: laufende.gestartet_am,
    } : null,
    zuKlaeren: entwuerfe.length,
    eigeneOffen: eigeneOffen.length,
    ...(alleOffen ? { genehmiger: true, antraegeOffen: alleOffen.length } : {}),
  };
}
