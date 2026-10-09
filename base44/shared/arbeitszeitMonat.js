// Die eigene Aufzeichnungsseite: Monat einer Person — Tage mit Stempeln, Projektbuchungen,
// Arbeitszeit, Soll, Saldo; dazu die eigenen Anträge und offene Klärfälle.
// Eine parallele Leserunde, alles Weitere im Speicher. `db` = base44.asServiceRole.entities
import { wienTag, werteTagAus, modusFuer, feiertag, wochentagKey, plusTage, darfGenehmigen } from './arbeitszeitKern.js';
import { ladeEinstellungen } from './arbeitszeitDaten.js';

const tageDesMonats = (monat, bis) => {
  const out = [];
  for (let t = `${monat}-01`; t.slice(0, 7) === monat && t <= bis; t = plusTage(t, 1)) out.push(t);
  return out;
};

export async function monatsAuskunft(db, wer, { monat, person_email } = {}, jetzt = new Date()) {
  const jetztIso = jetzt.toISOString();
  const heute = wienTag(jetzt);
  const m = /^\d{4}-\d{2}$/.test(String(monat || '')) ? monat : heute.slice(0, 7);
  const einst = await ladeEinstellungen(db);
  const genehmiger = darfGenehmigen(wer, einst);
  // Fremde Monate sieht nur, wer genehmigt
  const email = genehmiger && person_email ? String(person_email).toLowerCase() : wer;
  const von = `${m}-01`;
  const bis = `${m}-31`;

  const [stempel, buchungen, abwesend, antraege, offeneAlle] = await Promise.all([
    db.Stempel.filter({ person_email: email, tag: { $gte: von, $lte: bis } }, 'zeit', 3000),
    db.TimeEntry.filter({ person_email: email, entry_date: { $gte: von, $lte: bis } }, 'started_at', 3000),
    db.FocusDay.filter({ person_email: email, type: 'abwesend', day: { $lte: bis } }, '-day', 100).catch(() => []),
    db.Zeitantrag.filter({ person_email: email }, '-created_date', 300).catch(() => []),
    genehmiger ? db.Zeitantrag.filter({ status: 'offen' }, 'created_date', 500).catch(() => []) : Promise.resolve([]),
  ]);

  // Projekt- und Kundennamen nur für die vorkommenden Projekte
  const projektIds = [...new Set(buchungen.map((b) => b.project_id).concat(antraege.map((a) => a.nachher?.project_id)).filter(Boolean))];
  const projekte = projektIds.length ? await db.Project.filter({ id: { $in: projektIds } }, 'title', 500).catch(() => []) : [];
  const clientIds = [...new Set(projekte.map((p) => p.client_id).filter(Boolean))];
  const kunden = clientIds.length ? await db.Client.filter({ id: { $in: clientIds } }, 'name', 500).catch(() => []) : [];
  const kundeVon = Object.fromEntries(kunden.map((c) => [c.id, c.name]));
  const projektName = Object.fromEntries(projekte.map((p) => [p.id, { titel: p.title || '', kunde: kundeVon[p.client_id] || '' }]));

  const istAbwesend = (tag) => abwesend.some((f) => f.day <= tag && (f.until || f.day) >= tag);
  const letzter = m < heute.slice(0, 7) ? bis : heute;
  const tage = tageDesMonats(m, letzter).map((tag) => {
    const modus = modusFuer(email, tag, einst);
    const st = stempel.filter((s) => s.tag === tag);
    const bu = buchungen.filter((b) => b.entry_date === tag);
    const a = werteTagAus({
      tag, stempel: st, buchungen: bu, jetztIso, sollMin: modus.sollMin, abwesend: istAbwesend(tag),
      offeneAntraege: antraege.filter((x) => x.tag === tag && x.status === 'offen').length, stempelt: modus.stempelt,
    });
    return {
      tag,
      wochentag: wochentagKey(tag),
      feiertag: feiertag(tag),
      abwesend: istAbwesend(tag),
      neu: modus.neu,
      stempelt: modus.stempelt,
      ...a,
      stempel: st.map((s) => ({ id: s.id, art: s.art, zeit: s.zeit, quelle: s.quelle, status: s.status || 'gueltig' })),
      buchungen: bu.map((b) => ({
        id: b.id, project_id: b.project_id, projekt: projektName[b.project_id]?.titel || '', kunde: projektName[b.project_id]?.kunde || '',
        started_at: b.started_at || null, ended_at: b.ended_at || null, duration_minutes: Number(b.duration_minutes) || 0,
        note: b.note || '', quelle: b.quelle || 'timer', source: b.source || '', abrechnungsstatus: b.abrechnungsstatus || 'offen',
        ticket_id: b.ticket_id || null,
      })),
    };
  });

  const relevant = tage.filter((t) => t.neu);
  const summe = (f) => relevant.reduce((s, t) => s + (Number(t[f]) || 0), 0);
  const stempelt = modusFuer(email, letzter, einst).stempelt;
  return {
    person_email: email,
    monat: m,
    heute,
    jetzt: jetztIso,
    stempelt,
    genehmiger,
    summe: {
      sollMin: summe('sollMin'),
      arbeitszeitMin: summe('arbeitszeitMin'),
      saldoMin: summe('saldoMin'),
      projektzeitMin: summe('projektzeitMin'),
      ohneProjektMin: summe('ohneProjektMin'),
    },
    tage: tage.reverse(), // neuester Tag oben
    antraege: antraege.filter((a) => a.status !== 'entwurf').map((a) => ({
      ...a, projekt: projektName[a.nachher?.project_id]?.titel || '',
    })),
    zuKlaeren: antraege.filter((a) => a.status === 'entwurf').map((a) => ({
      ...a, projekt: projektName[a.nachher?.project_id]?.titel || a.nachher?.projekt_titel || '',
    })),
    ...(genehmiger ? { offeneAlle } : {}),
  };
}
