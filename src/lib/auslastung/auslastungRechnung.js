import { projectTypeOf } from '@/components/sprint/projectTypes';

export const fmtH = (v) => new Intl.NumberFormat('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v || 0);
export const fmtTag = (d) => (d ? new Date(d).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
export const rolleLabel = (r) => (r === 'Web' ? 'Entwicklung' : r);

export const topfVon = (t) => (t.origin === 'support' ? 'support' : t.rhythmus ? 'routine' : 'projekt');

// Reststunden je Ticket; null = ohne Schätzung
export function restVon(t, gebuchtH) {
  if (t.rest_stunden != null) return Math.max(0, t.rest_stunden);
  if (t.target_hours != null) return Math.max(0, t.target_hours - (gebuchtH || 0));
  return null;
}

const leer = () => ({ tickets: 0, rest: 0, ohne: 0 });

function addiere(sum, rest) {
  sum.tickets += 1;
  if (rest == null) sum.ohne += 1; else sum.rest += rest;
}

// Baut die Personenzeilen; pauschal = Stunden je Ticket ohne Schätzung (0 = aus)
export function berechne(daten, { pauschal, rolle, typ }) {
  const { tickets, projects, clients, members, sprints, entries } = daten;
  const projById = Object.fromEntries(projects.map((p) => [p.id, p]));
  const kundeById = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  const memberByMail = Object.fromEntries(members.map((m) => [m.email?.toLowerCase(), m]));
  const sprintByProj = {};
  sprints.forEach((s) => { if (!sprintByProj[s.project_id]) sprintByProj[s.project_id] = s.id; });
  const gebucht = {};
  entries.forEach((e) => { gebucht[e.ticket_id] = (gebucht[e.ticket_id] || 0) + (e.duration_minutes || 0) / 60; });

  const personen = {};
  members.forEach((m) => { personen[m.email.toLowerCase()] = neuePerson(m.email.toLowerCase(), m.name, m.roles || []); });
  const pausiert = leer();

  tickets.forEach((t) => {
    const p = projById[t.project_id];
    if (!p) return;
    if (typ !== 'alle' && projectTypeOf(p) !== typ) return;
    const rest = restVon(t, gebucht[t.id]);
    if (p.status === 'pausiert') { addiere(pausiert, rest); return; }
    if (p.status && p.status !== 'aktiv') return;
    const key = t.assignee_email ? t.assignee_email.toLowerCase() : '__nicht';
    if (!personen[key]) {
      personen[key] = neuePerson(key, key === '__nicht' ? 'Nicht zugewiesen' : t.assignee_email, [], key !== '__nicht');
    }
    const ps = personen[key];
    const topf = topfVon(t);
    addiere(ps[topf], rest);
    if (topf !== 'projekt') return;
    if (t.planned_for && (!ps.bis || t.planned_for > ps.bis)) ps.bis = t.planned_for;
    const pr = ps.projekte[p.id] || (ps.projekte[p.id] = {
      id: p.id, titel: p.title, kunde: kundeById[p.client_id] || '—', typ: projectTypeOf(p),
      link: sprintByProj[p.id] ? `/sprint/sprints/${sprintByProj[p.id]}` : null, ...leer(), bis: null,
    });
    addiere(pr, rest);
    if (t.planned_for && (!pr.bis || t.planned_for > pr.bis)) pr.bis = t.planned_for;
    const monat = !t.planned_for ? 'ohne' : t.planned_for < heute() ? 'ueber' : t.planned_for.slice(0, 7);
    ps.monate[monat] = (ps.monate[monat] || 0) + (rest == null ? pauschal : rest);
  });

  const zeilen = Object.values(personen)
    .filter((ps) => rolle === 'alle' || ps.rollen.includes(rolle))
    .filter((ps) => ps.projekt.tickets + ps.routine.tickets + ps.support.tickets > 0 || !ps.fremd)
    .map((ps) => abschliessen(ps, pauschal))
    .sort((a, b) => b.hoch - a.hoch);

  return { zeilen, pausiert: { ...pausiert, hoch: pausiert.rest + pausiert.ohne * pauschal }, gesamt: gesamtVon(zeilen, pauschal) };
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