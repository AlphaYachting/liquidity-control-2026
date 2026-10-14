import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  wirksamerBeginn, ladeStichtag, heuteWien, zaehltFuerLaufzeit, stundenVon, laufzeitAusSummen,
  monateListe, kontingentImMonat, r2,
} from '../../shared/kontingentLaufzeit.js';
import { aworkDbQuery, aworkDbBereit, sqlUuid, sqlDatum } from '../../shared/aworkDb.ts';

// Retainer: wie der Saldo entstanden ist — Monat für Monat, die letzten zwölf Monate.
// Nur lesend. Wird erst aufgerufen, wenn jemand das Seitenfenster öffnet.
// Eingabe { project_id } → Gesamtansicht; { project_id, monat, periode } → ein Monat im Detail.
// Rechenregel identisch mit dem Projektkopf (shared/kontingentLaufzeit.js):
//   bis einschließlich Stichtag zählt aWork (hier aus der Sicherung), danach nur die App.

const INTERNE_GRUENDE = ['fehler', 'interne_nacharbeit', 'einarbeitung'];
const GRUND_TEXT = {
  kulanz: 'Kulanz', interne_nacharbeit: 'Interne Nacharbeit', fehler: 'Fehler von uns', einarbeitung: 'Einarbeitung',
  akquise: 'Akquise', intern: 'Intern', ohne: 'ohne Grund',
};

const minMonat = (a, b) => (a < b ? a : b);
const monatMinus = (monat, n) => {
  let [y, m] = monat.split('-').map(Number);
  m -= n;
  while (m < 1) { m += 12; y -= 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
};
const monatsEnde = (monat) => {
  const [y, m] = monat.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const minDatum = (a, b) => (a < b ? a : b);
const maxDatum = (a, b) => (a > b ? a : b);

async function alleAppBuchungen(db, projectId) {
  const out = [];
  let skip = 0;
  const limit = 500;
  while (true) {
    const page = await db.TimeEntry.filter({ project_id: projectId }, '-entry_date', limit, skip);
    out.push(...page);
    if (page.length < limit) break;
    skip += limit;
  }
  return out;
}

// aWork-Stunden je Monat aus der Sicherung, exakt in Sekunden, für [von, bis] (beide inklusive)
async function aworkJeMonat(aworkId, von, bis) {
  const rows = await aworkDbQuery(
    `select to_char(e.start_date_local, 'YYYY-MM') as monat,
            coalesce(sum(e.duration_sec),0) as sek,
            coalesce(sum(e.duration_sec) filter (where e.is_billable = false),0) as sek_nicht_abr
     from awork.time_entries e
     where e.project_id = ${sqlUuid(aworkId)}
       and e.start_date_local >= ${sqlDatum(von)} and e.start_date_local < ${sqlDatum(bis)}::date + 1
     group by 1 order by 1`, { timeoutMs: 15000 });
  const out = {};
  for (const r of rows) out[r.monat] = { h: Number(r.sek) / 3600, nicht_abr: Number(r.sek_nicht_abr) / 3600 };
  return out;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    if (!body.project_id) return Response.json({ error: 'project_id fehlt' }, { status: 400 });

    const db = base44.asServiceRole.entities;
    const project = await db.Project.get(body.project_id);
    if (!project) return Response.json({ error: 'Projekt nicht gefunden' }, { status: 404 });
    if (project.abrechnungsmodell !== 'paket' || project.is_legacy) {
      return Response.json({ error: 'Nur für Retainer' }, { status: 400 });
    }

    const stichtag = await ladeStichtag(db);
    const heute = heuteWien();
    const wb = await wirksamerBeginn(db, project);
    const standardAktuell = Number(project.support_kontingent_stunden) || 0;

    // Perioden: abgeschlossene aus der Historie, dazu die laufende
    const perioden = (Array.isArray(project.laufzeit_historie) ? project.laufzeit_historie : [])
      .filter((h) => h?.beginn && h?.ende)
      .map((h) => ({
        beginn: String(h.beginn).slice(0, 10),
        ende: String(h.ende).slice(0, 10),
        abgeschlossen: true,
        standard: Number(h.kontingent_monat) || 0,
        uebertrag: Number(h.uebertrag) || 0,
        gespeichert: { verfuegbar: Number(h.verfuegbar) || 0, gebucht: Number(h.gebucht) || 0, saldo: Number(h.saldo) || 0, abgeschlossen_am: h.abgeschlossen_am || null },
      }))
      .sort((a, b) => a.beginn.localeCompare(b.beginn));
    if (wb.beginn && wb.beginn <= heute) {
      perioden.push({
        beginn: wb.beginn, ende: heute, abgeschlossen: false, standard: standardAktuell,
        uebertrag: Number(project.kontingent_uebertrag_stunden) || 0, gespeichert: null,
      });
    }

    const monatHeute = heute.slice(0, 7);
    const fensterVon = monatMinus(monatHeute, 11);
    const relevant = perioden.filter((p) => p.ende.slice(0, 7) >= fensterVon);

    const appAlle = await alleAppBuchungen(db, project.id);
    const aworkId = project.awork_project_id || null;
    let aworkFehler = null;
    if (aworkId && !aworkDbBereit()) aworkFehler = 'aWork-Sicherung ist nicht eingerichtet.';

    // ---------- Detail eines Monats ----------
    if (body.monat) {
      const monat = String(body.monat).slice(0, 7);
      const p = relevant[Number(body.periode) || 0] || relevant.find((x) => monateListe(x.beginn, x.ende).includes(monat));
      if (!p) return Response.json({ error: 'Monat liegt in keiner Periode' }, { status: 400 });
      const von = maxDatum(`${monat}-01`, p.beginn);
      const bis = minDatum(monatsEnde(monat), p.ende);

      const app = appAlle.filter((e) => zaehltFuerLaufzeit(e, { beginn: von, ende: bis, stichtag }));
      const ticketIds = [...new Set(app.map((e) => e.ticket_id).filter(Boolean))];
      const [tickets, members] = await Promise.all([
        ticketIds.length ? db.Ticket.filter({ id: { $in: ticketIds } }, 'title', 500).catch(() => []) : [],
        db.TeamMember.list('name', 300).catch(() => []),
      ]);
      const ticketTitel = Object.fromEntries(tickets.map((t) => [t.id, t.title]));
      const name = (email) => members.find((m) => String(m.email || '').toLowerCase() === String(email || '').toLowerCase())?.name || email || 'unbekannt';

      const aufgaben = {};
      const personen = {};
      const auffaellig = [];
      const add = (key, quelle, person, h, nv) => {
        const a = aufgaben[`${quelle}:${key}`] || (aufgaben[`${quelle}:${key}`] = { aufgabe: key, quelle, stunden: 0, nicht_verrechenbar: 0, personen: {} });
        a.stunden += h; a.nicht_verrechenbar += nv; a.personen[person] = (a.personen[person] || 0) + h;
        personen[person] = (personen[person] || 0) + h;
      };
      for (const e of app) {
        const h = stundenVon(e);
        const nv = e.verrechenbar === false ? h : 0;
        add(e.ticket_id ? (ticketTitel[e.ticket_id] || 'Aufgabe gelöscht') : 'ohne Aufgabe', 'app', name(e.person_email), h, nv);
        const intern = INTERNE_GRUENDE.includes(e.nicht_verrechenbar_grund);
        if (e.verrechenbar === false || e.mehrleistung || e.ueber_kontingent) {
          auffaellig.push({
            datum: e.entry_date, person: name(e.person_email), stunden: r2(h), notiz: e.note || '',
            aufgabe: e.ticket_id ? (ticketTitel[e.ticket_id] || '') : '',
            nicht_verrechenbar: e.verrechenbar === false,
            grund: e.verrechenbar === false ? (GRUND_TEXT[e.nicht_verrechenbar_grund] || GRUND_TEXT.ohne) : null,
            intern, mehrleistung: !!e.mehrleistung, ueber_kontingent: !!e.ueber_kontingent,
          });
        }
      }

      if (aworkId && !aworkFehler && von <= stichtag) {
        try {
          const rows = await aworkDbQuery(
            `select coalesce(t.name, 'ohne Aufgabe') as aufgabe,
                    coalesce(nullif(trim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), ''), 'unbekannt') as person,
                    coalesce(sum(e.duration_sec),0) as sek,
                    coalesce(sum(e.duration_sec) filter (where e.is_billable = false),0) as sek_nicht_abr
             from awork.time_entries e
             left join awork.tasks t on t.id = e.task_id
             left join awork.users u on u.id = e.user_id
             where e.project_id = ${sqlUuid(aworkId)}
               and e.start_date_local >= ${sqlDatum(von)} and e.start_date_local < ${sqlDatum(minDatum(bis, stichtag))}::date + 1
             group by 1, 2 order by 3 desc limit 400`, { timeoutMs: 15000 });
          for (const r of rows) add(r.aufgabe, 'awork', r.person, Number(r.sek) / 3600, Number(r.sek_nicht_abr) / 3600);
        } catch (err) {
          aworkFehler = `aWork-Sicherung nicht erreichbar: ${err.message}`;
        }
      }

      return Response.json({
        monat, periode: { beginn: p.beginn, ende: p.ende, abgeschlossen: p.abgeschlossen },
        kontingent: kontingentImMonat(project, monat, p.standard),
        aworkFehler,
        aufgaben: Object.values(aufgaben)
          .map((a) => ({ ...a, stunden: r2(a.stunden), nicht_verrechenbar: r2(a.nicht_verrechenbar),
            personen: Object.entries(a.personen).sort((x, y) => y[1] - x[1]).map(([n, h]) => ({ name: n, stunden: r2(h) })) }))
          .sort((x, y) => y.stunden - x.stunden),
        personen: Object.entries(personen).sort((x, y) => y[1] - x[1]).map(([n, h]) => ({ name: n, stunden: r2(h) })),
        auffaellig: auffaellig.sort((x, y) => String(x.datum).localeCompare(String(y.datum))),
      });
    }

    // ---------- Gesamtansicht ----------
    const ergebnis = [];
    for (let i = 0; i < relevant.length; i += 1) {
      const p = relevant[i];
      const monate = monateListe(p.beginn, p.ende);

      // aWork-Anteil der Periode (nur bis Stichtag) aus der Sicherung
      let aw = {};
      const awBis = minDatum(p.ende, stichtag);
      if (aworkId && !aworkFehler && p.beginn <= stichtag) {
        try {
          aw = await aworkJeMonat(aworkId, p.beginn, awBis);
        } catch (err) {
          aworkFehler = `aWork-Sicherung nicht erreichbar: ${err.message}`;
          aw = {};
        }
      }
      const awErwartet = !!aworkId && p.beginn <= stichtag;

      // App-Anteil der Periode
      const app = {};
      for (const e of appAlle) {
        if (!zaehltFuerLaufzeit(e, { beginn: p.beginn, ende: p.ende, stichtag })) continue;
        const m = String(e.entry_date).slice(0, 7);
        const x = app[m] || (app[m] = { h: 0, nv: 0, intern: 0, mehr: 0 });
        const h = stundenVon(e);
        x.h += h;
        if (e.verrechenbar === false) x.nv += h;
        if (e.verrechenbar === false && INTERNE_GRUENDE.includes(e.nicht_verrechenbar_grund)) x.intern += h;
        if (e.mehrleistung) x.mehr += h;
      }

      let laufend = p.uebertrag;
      let anfangsstand = null;
      const zeilen = [];
      let sumK = 0; let sumG = 0;
      for (const m of monate) {
        const k = kontingentImMonat(project, m, p.standard);
        const awH = awErwartet && m <= awBis.slice(0, 7) ? (aw[m]?.h || 0) : 0;
        const ap = app[m] || { h: 0, nv: 0, intern: 0, mehr: 0 };
        const g = awH + ap.h;
        sumK += k; sumG += g;
        if (m < fensterVon) { laufend += k - g; continue; }
        if (anfangsstand === null && monate[0] < fensterVon) anfangsstand = r2(laufend);
        laufend += k - g;
        zeilen.push({
          monat: m,
          kontingent: r2(k),
          kontingent_belegt: kontingentImMonat(project, m, null) !== 0 || (Array.isArray(project.kontingent_verlauf) && project.kontingent_verlauf.some((v) => m >= v.von && m <= v.bis)),
          awork: awErwartet && m <= awBis.slice(0, 7) ? r2(awH) : null,
          awork_nicht_abrechenbar: awErwartet && m <= awBis.slice(0, 7) ? r2(aw[m]?.nicht_abr || 0) : null,
          app: r2(ap.h),
          nicht_verrechenbar: r2(ap.nv),
          intern: r2(ap.intern),
          mehraufwand: r2(ap.mehr),
          gebucht: r2(g),
          monatssaldo: r2(k - g),
          laufender_saldo: r2(laufend),
        });
      }

      const gerechnet = { verfuegbar: r2(sumK + p.uebertrag), gebucht: r2(sumG), saldo: r2(sumK + p.uebertrag - sumG) };
      const periode = {
        index: i, beginn: p.beginn, ende: p.ende, abgeschlossen: p.abgeschlossen,
        standard: p.standard, uebertrag: r2(p.uebertrag), anfangsstand_vor_fenster: anfangsstand,
        aworkUnvollstaendig: awErwartet && !!aworkFehler,
        zeilen, gerechnet,
      };

      if (p.abgeschlossen) {
        periode.abschluss = {
          ...p.gespeichert,
          differenz_gebucht: r2(gerechnet.gebucht - p.gespeichert.gebucht),
          differenz_verfuegbar: r2(gerechnet.verfuegbar - p.gespeichert.verfuegbar),
          differenz_saldo: r2(gerechnet.saldo - p.gespeichert.saldo),
        };
      } else {
        // Abgleich mit dem Projektkopf: dieselbe Funktion wie projektZeitSummen
        const gebuchtApp = appAlle.filter((e) => zaehltFuerLaufzeit(e, { beginn: p.beginn, stichtag })).reduce((s, e) => s + stundenVon(e), 0);
        const kopf = laufzeitAusSummen({ project, beginn: wb.beginn, quelle: wb.quelle, ab_nummer: wb.ab_nummer, stichtag, heute, gebucht_app: gebuchtApp });
        const awSumme = Object.entries(aw).filter(([m]) => m >= p.beginn.slice(0, 7)).reduce((s, [, v]) => s + v.h, 0);
        periode.kopf = {
          saldo: kopf.saldo, gebucht_awork_im_projekt: kopf.gebucht_awork, gebucht_awork_sicherung: awErwartet ? r2(awSumme) : 0,
          differenz_saldo: r2(gerechnet.saldo - kopf.saldo),
        };
      }
      ergebnis.push(periode);
    }

    return Response.json({
      projekt: { titel: project.title, awork_project_id: aworkId, kontingent_aktuell: standardAktuell, verlauf_eingetragen: Array.isArray(project.kontingent_verlauf) && project.kontingent_verlauf.length > 0 },
      heute, stichtag, fenster_von: fensterVon, aworkFehler,
      perioden: ergebnis,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
