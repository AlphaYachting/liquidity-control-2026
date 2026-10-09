// Arbeitszeit — Datenzugriff und gemeinsame Abläufe der Funktionen stempeln, arbeitszeitStatus,
// zeitStarten, zeitAntrag*, arbeitszeitAutomatik. `db` = base44.asServiceRole.entities.
//
// Leistung: Jede Funktion lädt alles, was sie braucht, in EINER parallelen Runde (ladeLage) und
// rechnet danach im Speicher. Ein Knopfdruck kostet so im Normalfall vier Runden zur Datenbank:
// Lage laden → Stempel anlegen → nachlesen + Nachweis suchen → Nachweis schreiben.
import {
  EINSTELLUNG_KEYS, leseEinstellungen, modusFuer, wienTag, zustandJetzt, werteTagAus, spieleAb, erlaubt,
  darfGenehmigen,
} from './arbeitszeitKern.js';
import { laufendeVon, laufendeEntfernen, timerVerbuchen } from './zeitBuchung.js';

export const STEMPEL_ARTEN = ['kommen', 'pause_start', 'pause_ende', 'gehen'];

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

// Alles für eine Person und einen Tag in einer parallelen Runde. `einst` kann vorgegeben werden
// (Prüfskripte); sonst wird es in derselben Runde gelesen.
export async function ladeLage(db, email, tag, { einst = null, vorgangId = null } = {}) {
  const [settingRows, vorgang, stempel, laufende, buchungen, abwesend, entwuerfe, eigeneOffen, alleOffen] = await Promise.all([
    einst ? null : db.Setting.filter({ key: { $in: EINSTELLUNG_KEYS } }, 'key', 20).catch(() => []),
    stempelZuVorgang(db, email, vorgangId),
    ladeStempel(db, email, tag),
    laufendeVon(db, email),
    ladeBuchungen(db, email, tag),
    istAbwesend(db, email, tag),
    zuKlaeren(db, email),
    offeneAntraege(db, email),
    db.Zeitantrag.filter({ status: 'offen' }, 'created_date', 500).catch(() => []),
  ]);
  return {
    einst: einst || leseEinstellungen(settingRows || []),
    vorgang, stempel, laufende, buchungen, abwesend, entwuerfe, eigeneOffen, alleOffen,
  };
}

// Auswertung des Tages aus einer geladenen Lage (rein rechnend)
export function auswertungAus(email, tag, lage, jetztIso) {
  const modus = modusFuer(email, tag, lage.einst);
  const auswertung = werteTagAus({
    tag, stempel: lage.stempel, buchungen: lage.buchungen, jetztIso, sollMin: modus.sollMin,
    abwesend: lage.abwesend, offeneAntraege: lage.eigeneOffen.filter((a) => a.tag === tag).length,
    stempelt: modus.stempelt,
  });
  return { modus, auswertung };
}

// Antwort an den Browser aus einer geladenen Lage (rein rechnend)
export function standAus(email, tag, lage, jetztIso) {
  const { modus, auswertung } = auswertungAus(email, tag, lage, jetztIso);
  if (!modus.neu) return { aktiv: false, jetzt: jetztIso, tag };
  const laufende = lage.laufende;
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
    zuKlaeren: lage.entwuerfe.length,
    eigeneOffen: lage.eigeneOffen.length,
    ...(darfGenehmigen(email, lage.einst) ? { genehmiger: true, antraegeOffen: lage.alleOffen.length } : {}),
  };
}

// Der ganze Ablauf eines Knopfdrucks — hier statt in der Funktion, damit er prüfbar ist.
// Ergebnis: { status (HTTP), extra, stand } — stand ist der neue Stand für den Browser.
export async function stempelnAblauf(db, email, einst, { art, vorgang_id, erwartet, notiz = '' }, jetzt = new Date()) {
  if (!STEMPEL_ARTEN.includes(art)) return { status: 400, extra: { fehler: 'Unbekannte Art' }, ohneStand: true };
  const jetztIso = jetzt.toISOString();
  const tag = wienTag(jetzt);

  // Runde 1: alles parallel
  let lage = await ladeLage(db, email, tag, { einst, vorgangId: vorgang_id });
  const modus = modusFuer(email, tag, lage.einst);
  if (!modus.neu) return { status: 409, extra: { fehler: 'nicht_aktiv' }, ohneStand: true };
  if (!modus.stempelt) return { status: 400, extra: { fehler: 'stempelt_nicht' }, ohneStand: true };

  // Wiederholung desselben Knopfdrucks: nichts Neues, aktueller Stand zurück.
  if (lage.vorgang) return { status: 200, extra: { ok: true, wiederholt: true }, stand: standAus(email, tag, lage, jetztIso) };

  // Selten: fälliges automatisches Gehen oder ein Timer außerhalb der Anwesenheit — dann neu laden.
  const nachgezogen = await automatikNachziehen(db, email, tag, lage.stempel, jetztIso, { laufende: lage.laufende });
  const aufgeraeumt = !nachgezogen && await timerAufraeumen(db, email, jetztIso, {
    bindung: bindungAktiv(lage.einst, tag), laufende: lage.laufende, stempelHeute: lage.stempel, tag,
  });
  if (nachgezogen || aufgeraeumt) lage = await ladeLage(db, email, tag, { einst: lage.einst });

  const zustand = zustandJetzt(lage.stempel, jetztIso).zustand;
  const stand = () => standAus(email, tag, lage, jetztIso);
  if (erwartet && erwartet !== zustand) return { status: 409, extra: { fehler: 'veraltet' }, stand: stand() };
  if (!erlaubt(zustand, art)) return { status: 409, extra: { fehler: 'nicht_moeglich' }, stand: stand() };

  // Pause und Gehen stoppen einen laufenden Timer von heute — vor dem Stempel, damit nie ein Timer
  // in einer Pause weiterläuft. Bei Wiederholung erkennt timerVerbuchen die Buchung wieder.
  let gebucht = null;
  if ((art === 'pause_start' || art === 'gehen') && lage.laufende && wienTag(lage.laufende.gestartet_am) === tag) {
    const l = lage.laufende;
    const r = await timerVerbuchen(db, l, { notiz, endeIso: jetztIso, tag });
    gebucht = { id: r.eintrag.id, minuten: r.eintrag.duration_minutes, project_id: r.eintrag.project_id, projekt_titel: l.projekt_titel || '' };
    lage = { ...lage, laufende: null, buchungen: r.wiederholt ? lage.buchungen : [...lage.buchungen, r.eintrag] };
  }

  // Runde 2: Stempel anlegen
  const neu = await db.Stempel.create({
    person_email: email, tag, art, zeit: jetztIso, quelle: 'knopf', status: 'gueltig',
    ...(vorgang_id ? { vorgang_id } : {}), erfasst_von: email,
  });

  // Runde 3: nachlesen (zwei Fenster gleichzeitig? der erste Stempel gewinnt) und Nachweis suchen
  const [stempelNeu, nachweisRows] = await Promise.all([
    ladeStempel(db, email, tag),
    db.Tagesnachweis.filter({ person_email: email, tag }, 'created_date', 10),
  ]);
  lage = { ...lage, stempel: stempelNeu };
  const { konflikte } = spieleAb(stempelNeu);
  const { auswertung } = auswertungAus(email, tag, lage, jetztIso);

  // Runde 4: Konflikte markieren und Nachweis schreiben, parallel
  await Promise.all([
    ...konflikte.map((id) => db.Stempel.update(id, { status: 'ungueltig', status_grund: KONFLIKT_GRUND }).catch(() => null)),
    nachweisSchreiben(db, email, tag, auswertung, { rows: nachweisRows }),
  ]);

  if (konflikte.includes(neu.id)) return { status: 409, extra: { fehler: 'veraltet', gebucht }, stand: stand() };
  return { status: 200, extra: { ok: true, art, gebucht }, stand: stand() };
}

const KONFLIKT_GRUND = 'passt nicht zum Zustand davor (Doppelklick oder zweites Fenster)';

// Die Automatik zieht nach, was die Rechnung ohnehin ergibt — idempotent über vorgang_id:
// 1. fälliges „Gehen unklar“ als Stempel (quelle auto) festschreiben,
// 2. einen dabei noch laufenden Timer NICHT buchen, sondern als Entwurf „Ende angeben“ ablegen,
// 3. einen Entwurf „Gehen angeben“ für die Person anlegen.
// Gibt zurück, ob etwas geschrieben wurde. Ohne Fälligkeit: keine einzige Abfrage.
export async function automatikNachziehen(db, email, tag, stempel, jetztIso, { laufende } = {}) {
  const ab = spieleAb(stempel);
  if (ab.zustand === 'weg' || !ab.letztesKommen) return false;
  const z = zustandJetzt(stempel, jetztIso);
  if (!z.gehenUnklar || !z.autoGehenFaellig) return false;
  const kommen = ab.wirksam.filter((s) => s.art === 'kommen').pop();
  const vorgang = `auto:${kommen.id}`;

  // Timer zuerst sichern — er darf nie verloren gehen.
  const timer = laufende === undefined ? await laufendeVon(db, email) : laufende;
  if (timer && timer.gestartet_am <= z.autoGehenFaellig) {
    await timerAlsEntwurf(db, email, timer, z.autoGehenFaellig, 'Gehen nicht gestempelt — Timer automatisch angehalten');
  }

  const gVorgang = `gehen:${kommen.id}`;
  const [schonGestempelt, schonEntwurf] = await Promise.all([
    stempelZuVorgang(db, email, vorgang),
    db.Zeitantrag.filter({ person_email: email, vorgang_id: gVorgang }, 'created_date', 1),
  ]);
  await Promise.all([
    schonGestempelt ? null : db.Stempel.create({
      person_email: email, tag, art: 'gehen', zeit: z.autoGehenFaellig,
      quelle: 'auto', status: 'gueltig', vorgang_id: vorgang, erfasst_von: 'automatik',
      status_grund: 'Gehen nicht gestempelt — automatisch beendet, Gehen unklar',
    }),
    schonEntwurf[0] ? null : db.Zeitantrag.create({
      person_email: email, tag, ziel: 'stempel', art: 'gehen_angeben', status: 'entwurf',
      vorher: { kommen: kommen.zeit, automatisch_beendet_am: z.autoGehenFaellig },
      nachher: {}, vorgang_id: gVorgang,
    }),
  ]);
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

// Timer-Bindung an die Anwesenheit gilt erst ab dem Stichtag. Im Pilot davor läuft der Timer
// wie bisher unabhängig — der Pilot darf die gewohnte Zeiterfassung nicht stören.
export const bindungAktiv = (einst, tag) => !!einst.neuAb && tag >= einst.neuAb;

// Ein Timer, der außerhalb der Anwesenheit läuft (vom Vortag übrig, vor dem Stichtag gestartet,
// Gehen in einem anderen Fenster), wird zum Entwurf. Nur für Personen, die stempeln, und nur
// wenn die Bindung gilt; ein vergessenes Gehen wird immer nachgezogen.
// Vorgeladene Daten (laufende, stempelHeute, tag) sparen Abfragen; ohne Timer: keine Abfrage.
export async function timerAufraeumen(db, email, jetztIso, { bindung = true, laufende, stempelHeute, tag } = {}) {
  const timer = laufende === undefined ? await laufendeVon(db, email) : laufende;
  if (!timer) return false;
  const tagT = wienTag(timer.gestartet_am);
  // Timer von heute im Pilot ohne Bindung: nichts zu prüfen, nichts zu laden
  if (!bindung && tag && tagT === tag) return false;
  const stempel = stempelHeute && tagT === tag ? stempelHeute : await ladeStempel(db, email, tagT);
  if (await automatikNachziehen(db, email, tagT, stempel, jetztIso, { laufende: timer })) return true;
  if (!bindung) return false;
  if (zustandJetzt(stempel, jetztIso).zustand === 'da') return false;
  await timerAlsEntwurf(db, email, timer, jetztIso, 'Timer lief ohne Anwesenheit');
  return true;
}

// Widersprüchliche Stempel (zwei Tabs, gleiche Vorgangsnummer) ungültig setzen — der erste gewinnt.
export async function konflikteBereinigen(db, stempel) {
  const { konflikte } = spieleAb(stempel);
  await Promise.all(konflikte.map((id) => db.Stempel.update(id, { status: 'ungueltig', status_grund: KONFLIKT_GRUND }).catch(() => null)));
  return konflikte;
}

// Tagesstand einer Person berechnen (ohne zu schreiben) — für Automatik und Anträge.
export async function tagesstand(db, email, tag, jetztIso, einst) {
  const lage = await ladeLage(db, email, tag, { einst });
  const { modus, auswertung } = auswertungAus(email, tag, lage, jetztIso);
  return { modus, stempel: lage.stempel, buchungen: lage.buchungen, auswertung };
}

// Tagesnachweis schreiben (Upsert). Ein festgeschriebener Tag wird nur mit `auchFest` neu berechnet
// (Genehmigung eines Antrags, Korrektur durch Alfons). `rows` = bereits geladene Nachweise des Tages.
export async function nachweisSchreiben(db, email, tag, a, { festschreiben = false, auchFest = false, rows } = {}) {
  const vorhanden = rows || await db.Tagesnachweis.filter({ person_email: email, tag }, 'created_date', 10);
  const [erster, ...doppelt] = vorhanden;
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
  const [ergebnis] = await Promise.all([
    erster ? db.Tagesnachweis.update(erster.id, daten) : db.Tagesnachweis.create(daten),
    ...doppelt.map((d) => db.Tagesnachweis.delete(d.id).catch(() => null)), // abgeleitete Daten
  ]);
  return ergebnis;
}

export async function nachweisNeu(db, email, tag, einst, { jetzt = new Date(), ...opts } = {}) {
  const { auswertung } = await tagesstand(db, email, tag, jetzt.toISOString(), einst);
  return nachweisSchreiben(db, email, tag, auswertung, opts);
}

// Stand für den Browser, eine Runde (für Prüfskripte und Funktionen ohne eigene Lage)
export async function statusAntwort(db, email, einst, { jetzt = new Date() } = {}) {
  const jetztIso = jetzt.toISOString();
  const tag = wienTag(jetztIso);
  const lage = await ladeLage(db, email, tag, { einst });
  return standAus(email, tag, lage, jetztIso);
}

// Die Funktion arbeitszeitStatus: eine Runde laden, nur bei Fälligkeit nachziehen und neu laden.
export async function statusAbfrage(db, email, jetzt = new Date()) {
  const jetztIso = jetzt.toISOString();
  const tag = wienTag(jetztIso);
  let lage = await ladeLage(db, email, tag);
  const modus = modusFuer(email, tag, lage.einst);
  if (!modus.neu) return { aktiv: false, jetzt: jetztIso, tag };
  if (modus.stempelt) {
    const nachgezogen = await automatikNachziehen(db, email, tag, lage.stempel, jetztIso, { laufende: lage.laufende });
    const aufgeraeumt = !nachgezogen && await timerAufraeumen(db, email, jetztIso, {
      bindung: bindungAktiv(lage.einst, tag), laufende: lage.laufende, stempelHeute: lage.stempel, tag,
    });
    if (nachgezogen || aufgeraeumt) {
      lage = await ladeLage(db, email, tag, { einst: lage.einst });
      const { auswertung } = auswertungAus(email, tag, lage, jetztIso);
      await nachweisSchreiben(db, email, tag, auswertung);
    }
  }
  return standAus(email, tag, lage, jetztIso);
}
