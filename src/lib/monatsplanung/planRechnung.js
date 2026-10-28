import { projectTypeOf } from '@/components/sprint/projectTypes';
import { zustaendigeVon, normMail } from '@/lib/sprint/zustaendige';

// MONATSPLANUNG — reine Rechnung, ohne Hochrechnung und ohne Vergangenheitswerte.
// Ein Monat = was ist fix vergeben, welche Retainer liegen bei wem, was liegt als Vorrat bereit.
//
// Regeln (Entscheidung Alfons 28.10.2026):
// - Retainer (Projekttyp Retainer inkl. Wartungsverträge) zählen bei der Projektleitung, mit Monatskontingent.
// - Tickets in Retainer-Projekten erscheinen bei der zuständigen Person, ihre Stunden stecken aber im
//   Kontingent und werden nicht ein zweites Mal gezählt.
// - Stunden eines Tickets = Rest-Einschätzung, sonst Zeitvorgabe. Ohne Vorgabe (leer oder 0) zählt nur die Anzahl.
// - Mehrere Zuständige teilen sich die Stunden gleichmäßig; das Ticket erscheint bei jeder Person.
// - Ohne Eintrag gilt eine Person als verfügbar.

export const fmtH = (v) => new Intl.NumberFormat('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v || 0);
export const fmtTag = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' }) : '—');
export const rolleLabel = (r) => (r === 'Web' ? 'Entwicklung' : r);

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function heuteIso() {
  return iso(new Date());
}

// Planungsmonate: laufender Monat und die fünf folgenden; Standard ist der kommende Monat
export function monatsAuswahl(n = 6) {
  const d = new Date();
  return Array.from({ length: n }, (_, i) => {
    const m = new Date(d.getFullYear(), d.getMonth() + i, 1);
    return {
      key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`,
      label: m.toLocaleDateString('de-AT', { month: 'long', year: 'numeric' }),
    };
  });
}

export function monatsGrenzen(monat) {
  const [j, m] = monat.split('-').map(Number);
  return { von: iso(new Date(j, m - 1, 1)), bis: iso(new Date(j, m, 0)) };
}

// Rest-Einschätzung vor Zeitvorgabe; null = ohne Vorgabe
export function stundenVon(t) {
  if (t.rest_stunden != null) return Math.max(0, Number(t.rest_stunden) || 0);
  const v = Number(t.target_hours);
  return v > 0 ? v : null;
}

const leerVorrat = () => ({ tickets: 0, std: 0, ohne: 0 });

function neuePerson(key, mitglied) {
  return {
    key,
    name: mitglied?.name || key,
    rollen: mitglied?.roles || [],
    fremd: !mitglied,
    extern: !!mitglied?.extern,
    kapazitaet: mitglied?.extern ? Number(mitglied?.kapazitaet_monat_stunden) || null : null,
    retainer: [],
    fix: [],
    vorrat: {},
    spaeter: 0,
  };
}

export function rechnePlan(daten, monat, verfuegbarkeit = [], heute = heuteIso()) {
  const { tickets, projekte, kunden, team, sprints } = daten;
  const { von, bis } = monatsGrenzen(monat);
  const projById = Object.fromEntries(projekte.map((p) => [p.id, p]));
  const kundeById = Object.fromEntries(kunden.map((k) => [k.id, k.name]));
  const sprintVon = {};
  sprints.forEach((s) => { if (!sprintVon[s.project_id]) sprintVon[s.project_id] = s.id; });
  const linkVon = (pid) => (sprintVon[pid] ? `/sprint/sprints/${sprintVon[pid]}` : null);
  const verfVon = Object.fromEntries(verfuegbarkeit.map((v) => [normMail(v.person_email), v]));

  const personen = {};
  team.forEach((m) => { personen[normMail(m.email)] = neuePerson(normMail(m.email), m); });
  const person = (key) => personen[key] || (personen[key] = neuePerson(key, null));

  // 1. Retainer bei der Projektleitung
  projekte.filter((p) => projectTypeOf(p) === 'container').forEach((p) => {
    const pl = normMail(p.pm_email);
    if (!pl) return;
    const k = Number(p.support_kontingent_stunden);
    person(pl).retainer.push({
      id: p.id,
      titel: p.title,
      kunde: kundeById[p.client_id] || '—',
      projekt: p,
      kontingent: k > 0 ? k : null,
      link: linkVon(p.id),
    });
  });

  // 2. Tickets
  const nz = { projekte: {}, tickets: 0, std: 0, ohne: 0 };
  tickets.forEach((t) => {
    const p = projById[t.project_id];
    if (!p) return; // Projekt pausiert oder abgeschlossen
    const std = stundenVon(t);
    const imKontingent = projectTypeOf(p) === 'container';
    const termin = t.planned_for || null;
    const lage = !termin ? 'vorrat'
      : termin > bis ? 'spaeter'
        : termin >= von ? 'monat'
          : termin < heute ? 'ueberfaellig' : 'vorher';
    const zust = zustaendigeVon(t);

    if (!zust.length) {
      if (lage === 'spaeter' || lage === 'vorher') return;
      const g = nz.projekte[p.id] || (nz.projekte[p.id] = { id: p.id, titel: p.title, kunde: kundeById[p.client_id] || '—', projekt: p, link: linkVon(p.id), ...leerVorrat() });
      g.tickets += 1; nz.tickets += 1;
      if (std == null) { g.ohne += 1; nz.ohne += 1; } else { g.std += std; nz.std += std; }
      return;
    }

    const anteil = 1 / zust.length;
    zust.forEach((key) => {
      const ps = person(key);
      if (lage === 'spaeter') { ps.spaeter += 1; return; }
      if (lage === 'vorher') return;
      if (lage === 'vorrat') {
        const g = ps.vorrat[p.id] || (ps.vorrat[p.id] = { id: p.id, titel: p.title, kunde: kundeById[p.client_id] || '—', projekt: p, link: linkVon(p.id), ...leerVorrat() });
        g.tickets += 1;
        if (std == null) g.ohne += 1; else g.std += std * anteil;
        return;
      }
      ps.fix.push({
        id: t.id,
        titel: t.title,
        projekt: p,
        projektTitel: p.title,
        kunde: kundeById[p.client_id] || '—',
        termin,
        std: std == null ? null : std * anteil,
        geteilt: zust.length > 1 ? zust.filter((z) => z !== key) : [],
        imKontingent,
        routine: !!t.rhythmus,
        ueberfaellig: lage === 'ueberfaellig',
        link: linkVon(p.id),
      });
    });
  });

  // 3. Personen abschließen
  const namen = Object.fromEntries(Object.values(personen).map((p) => [p.key, p.name]));
  const liste = Object.values(personen).map((ps) => {
    const eintrag = verfVon[ps.key] || null;
    const fix = ps.fix
      .map((f) => ({ ...f, geteiltNamen: f.geteilt.map((k) => namen[k] || k) }))
      .sort((a, b) => (b.ueberfaellig - a.ueberfaellig) || (a.termin || '').localeCompare(b.termin || ''));
    const vorrat = Object.values(ps.vorrat).sort((a, b) => b.std - a.std || b.tickets - a.tickets);
    const retainer = [...ps.retainer].sort((a, b) => (b.kontingent || 0) - (a.kontingent || 0));
    const gezaehlt = fix.filter((f) => !f.imKontingent);
    const summe = {
      retainerStd: retainer.reduce((s, r) => s + (r.kontingent || 0), 0),
      retainerOhne: retainer.filter((r) => !r.kontingent).length,
      fixStd: gezaehlt.reduce((s, f) => s + (f.std || 0), 0),
      fixTickets: fix.length,
      fixOhne: gezaehlt.filter((f) => f.std == null).length,
      ueberfaellig: fix.filter((f) => f.ueberfaellig).length,
      vorratTickets: vorrat.reduce((s, v) => s + v.tickets, 0),
      vorratStd: vorrat.reduce((s, v) => s + v.std, 0),
      vorratOhne: vorrat.reduce((s, v) => s + v.ohne, 0),
    };
    summe.gebunden = summe.retainerStd + summe.fixStd;
    return {
      ...ps,
      fix,
      vorrat,
      retainer,
      summe,
      eintrag,
      verfuegbar: eintrag ? eintrag.verfuegbar !== false : true,
    };
  })
    // Ausgeschiedene Personen nur, wenn ihnen noch etwas gehört
    .filter((p) => !p.fremd || p.retainer.length || p.fix.length || p.summe.vorratTickets)
    .sort((a, b) => (a.extern - b.extern) || (a.fremd - b.fremd) || a.name.localeCompare(b.name, 'de'));

  const nichtZugewiesen = { ...nz, projekte: Object.values(nz.projekte).sort((a, b) => b.std - a.std || b.tickets - a.tickets) };
  const verf = liste.filter((p) => !p.fremd && p.verfuegbar);
  return {
    monat,
    von,
    bis,
    personen: liste,
    nichtZugewiesen,
    gesamt: {
      team: liste.filter((p) => !p.fremd).length,
      verfuegbar: verf.length,
      retainerStd: liste.reduce((s, p) => s + p.summe.retainerStd, 0),
      fixStd: liste.reduce((s, p) => s + p.summe.fixStd, 0),
      fixOhne: liste.reduce((s, p) => s + p.summe.fixOhne, 0),
      ueberfaellig: liste.reduce((s, p) => s + p.summe.ueberfaellig, 0),
      vorratTickets: liste.reduce((s, p) => s + p.summe.vorratTickets, 0),
      // Nicht verfügbar, aber mit Arbeit im Monat — muss umverteilt werden
      umverteilen: liste.filter((p) => !p.fremd && !p.verfuegbar && (p.summe.fixTickets || p.retainer.length)).length,
    },
  };
}
