import { projectTypeOf } from '@/components/sprint/projectTypes';
import { artVon } from '@/lib/auslastung/arbeitsart';

export const fmtH = (v) => new Intl.NumberFormat('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v || 0);
export const fmtEUR = (v) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);
export const fmtTag = (d) => (d ? new Date(d).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
export const rolleLabel = (r) => (r === 'Web' ? 'Entwicklung' : r);
export const STUNDENSATZ = 120;

export const topfVon = (t) => (t.origin === 'support' ? 'support' : t.rhythmus ? 'routine' : 'projekt');

// App-Buchungen je Ticket in Stunden
export function appGebucht(entries) {
  const g = {};
  entries.forEach((e) => { g[e.ticket_id] = (g[e.ticket_id] || 0) + (e.duration_minutes || 0) / 60; });
  return g;
}

// Stand je Ticket: Plan, bereits geleistet (aWork + App), Rest (null = ohne Schätzung)
export function ticketStand(t, appH, aworkMinuten) {
  const awMin = aworkMinuten[t.id];
  const geleistet = (appH || 0) + (awMin || 0) / 60;
  const plan = t.target_hours ?? null;
  const unbekannt = plan != null && awMin == null;
  if (t.rest_stunden != null) return { plan, geleistet, rest: Math.max(0, t.rest_stunden), unbekannt, verbraucht: false };
  if (plan != null) return { plan, geleistet, rest: Math.max(0, plan - geleistet), unbekannt, verbraucht: geleistet >= plan };
  return { plan, geleistet, rest: null, unbekannt: false, verbraucht: false };
}

const leer = () => ({ tickets: 0, rest: 0, ohne: 0, plan: 0, geleistet: 0, unbekannt: 0 });

function addiere(sum, st) {
  sum.tickets += 1;
  sum.plan += st.plan || 0;
  sum.geleistet += st.geleistet;
  if (st.unbekannt) sum.unbekannt += 1;
  if (st.rest == null) sum.ohne += 1; else sum.rest += st.rest;
}

function abrechenbar(lp) {
  if (!lp) return null;
  if (lp.open_amount != null) return Math.max(0, lp.open_amount);
  return Math.max(0, (lp.total_net_amount || 0) - (lp.already_invoiced_amount || 0));
}

// Baut die Personenzeilen; pauschal = Stunden je Ticket ohne Schätzung (0 = aus)
export function berechne(daten, { pauschal, rolle, typ }) {
  const { tickets, projects, clients, members, sprints, entries, aworkMinuten, liquidity } = daten;
  const projById = Object.fromEntries(projects.map((p) => [p.id, p]));
  const lpById = Object.fromEntries(liquidity.map((l) => [l.id, l]));
  const kundeById = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  const sprintByProj = {};
  sprints.forEach((s) => { if (!sprintByProj[s.project_id]) sprintByProj[s.project_id] = s.id; });
  const gebucht = appGebucht(entries);

  const personen = {};
  members.forEach((m) => { personen[m.email.toLowerCase()] = neuePerson(m.email.toLowerCase(), m.name, m.roles || []); });
  const pausiert = leer();
  const verbraucht = [];
  const fixProjekte = {};

  tickets.forEach((t) => {
    const p = projById[t.project_id];
    if (!p) return;
    if (typ !== 'alle' && projectTypeOf(p) !== typ) return;
    const st = ticketStand(t, gebucht[t.id], aworkMinuten);
    if (p.status === 'pausiert') { addiere(pausiert, st); return; }
    if (p.status && p.status !== 'aktiv') return;
    const key = t.assignee_email ? t.assignee_email.toLowerCase() : '__nicht';
    if (!personen[key]) {
      personen[key] = neuePerson(key, key === '__nicht' ? 'Nicht zugewiesen' : t.assignee_email, [], key !== '__nicht');
    }
    const ps = personen[key];
    if (st.verbraucht) verbraucht.push({ id: t.id, projekt: p.title, ticket: t.title, person: ps.name, plan: st.plan, geleistet: st.geleistet });
    const topf = topfVon(t);
    addiere(ps[topf], st);
    if (topf !== 'projekt') return;
    if (t.planned_for && (!ps.bis || t.planned_for > ps.bis)) ps.bis = t.planned_for;
    const offenEuro = p.liquidity_project_id ? abrechenbar(lpById[p.liquidity_project_id]) : null;
    const pr = ps.projekte[p.id] || (ps.projekte[p.id] = {
      id: p.id, titel: p.title, kunde: kundeById[p.client_id] || '—', typ: projectTypeOf(p),
      link: sprintByProj[p.id] ? `/sprint/sprints/${sprintByProj[p.id]}` : null, ...leer(), bis: null, abrechenbar: offenEuro,
    });
    addiere(pr, st);
    if (t.planned_for && (!pr.bis || t.planned_for > pr.bis)) pr.bis = t.planned_for;
    if (artVon(p, t) === 'fix') {
      const fp = fixProjekte[p.id] || (fixProjekte[p.id] = { rest: 0, abrechenbar: offenEuro });
      fp.rest += st.rest || 0;
    }
    const monat = !t.planned_for ? 'ohne' : t.planned_for < heute() ? 'ueber' : t.planned_for.slice(0, 7);
    ps.monate[monat] = (ps.monate[monat] || 0) + (st.rest == null ? pauschal : st.rest);
  });

  const zeilen = Object.values(personen)
    .filter((ps) => rolle === 'alle' || ps.rollen.includes(rolle))
    .filter((ps) => ps.projekt.tickets + ps.routine.tickets + ps.support.tickets > 0 || !ps.fremd)
    .map((ps) => abschliessen(ps, pauschal))
    .sort((a, b) => b.hoch - a.hoch);

  const fix = Object.values(fixProjekte);
  const deckung = {
    restWert: fix.reduce((s, f) => s + f.rest * STUNDENSATZ, 0),
    abrechenbar: fix.reduce((s, f) => s + (f.abrechenbar || 0), 0),
  };
  return { zeilen, verbraucht, pausiert: { ...pausiert, hoch: pausiert.rest + pausiert.ohne * pauschal }, gesamt: { ...gesamtVon(zeilen, pauschal), deckung } };
}

const heute = () => new Date().toISOString().slice(0, 10);

function neuePerson(key, name, rollen, fremd = false) {
  return { key, name, rollen, fremd, projekt: leer(), routine: leer(), support: leer(), projekte: {}, monate: {}, bis: null };
}

function abschliessen(ps, pauschal) {
  const { tickets, rest, ohne } = ps.projekt;
  const anteil = tickets ? (tickets - ohne) / tickets : 1;
  return { ...ps, hoch: rest + ohne * pauschal, anteil, unsicher: tickets > 0 && anteil < 0.5, projektListe: Object.values(ps.projekte) };
}

function gesamtVon(zeilen, pauschal) {
  const tickets = zeilen.reduce((s, z) => s + z.projekt.tickets, 0);
  const rest = zeilen.reduce((s, z) => s + z.projekt.rest, 0);
  const ohne = zeilen.reduce((s, z) => s + z.projekt.ohne, 0);
  return { tickets, rest, ohne, hoch: rest + ohne * pauschal, anteil: tickets ? (tickets - ohne) / tickets : 1 };
}