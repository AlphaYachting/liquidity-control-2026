// Aufbau des Suchindex. Eine Stelle für den vollen Lauf und für die
// Einzelauffrischung — damit eine Zeile nach dem Speichern genauso aussieht
// wie nach dem nächtlichen Lauf.
//
// Hierarchie (entschieden 02.10.2026): Kunde → Projekt → Aufgaben zum Projekt.
// Projekt = Entity Project (Arbeitsprojekt, Ansicht /sprint/sprints/:sprintId).
// Das Projekt-Cockpit (LiquidityProject) ist Finanzebene: nur für Personen mit
// Finanzrecht — als Verweis am Projekt oder, ohne verknüpftes Projekt, als
// eigene Zeile in der Gruppe Geld.
import { haystackVon, normalize } from './searchNormalize.js';
import { NAV_TARGETS } from './navTargets.js';

export const GEWICHT = {
  kunde: 60, projekt: 45, auftrag: 35, seite: 34, rechnung: 30, cockpit: 30,
  anweisung: 28, angebot: 28, ticket: 25, vertrag: 22, akte: 14,
};

const eur = (n) => `${Math.round(Number(n) || 0).toLocaleString('de-AT')} €`;
const tag = (d) => (d ? String(d).slice(0, 10) : null);
const heute = () => new Date().toISOString().slice(0, 10);
const vorTagen = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const tageSeit = (d) => (d ? Math.round((Date.now() - new Date(d).getTime()) / 86400000) : null);

const STATUS_TEXT = { offen: 'offen', in_arbeit: 'in Arbeit', wartet: 'wartet', erledigt: 'erledigt' };

function mach(o, stichworte = []) {
  return {
    entry_type: o.entry_type,
    ref_entity: o.ref_entity,
    ref_id: o.ref_id,
    client_id: o.client_id || '',
    client_name: o.client_name || '',
    title: o.title || '(ohne Titel)',
    subtitle: o.subtitle || '',
    side: o.side || '',
    side_note: o.side_note || '',
    is_due: !!o.is_due,
    area: o.area,
    owner_email: o.owner_email || '',
    route: o.route,
    route_cockpit: o.route_cockpit || '',
    kuerzel: o.kuerzel ? normalize(o.kuerzel) : '',
    ist_erledigt: !!o.ist_erledigt,
    activity_at: tag(o.activity_at),
    weight: o.weight ?? (GEWICHT[o.entry_type] || 10),
    card: o.card || [],
    card_team: o.card_team || [],
    is_active: true,
    haystack: haystackVon([o.title, o.subtitle, o.client_name, ...stichworte]),
  };
}

// ── Quellen laden ───────────────────────────────────────────────────────────
async function alle(sr, name, sort = '-updated_date', limit = 4000) {
  try {
    return await sr.entities[name].list(sort, limit);
  } catch (e) {
    return [];
  }
}

// Welche Zeit-Entity gilt? Vor dem Umstellungstag awork, ab ihm die eigene.
async function zeitQuelle(sr) {
  const rows = await sr.entities.Setting.filter({ key: 'tag_null_zeit' }, '-created_date', 1);
  const tagNull = rows[0]?.value ? String(rows[0].value).slice(0, 10) : null;
  return { tagNull, eigene: !!tagNull && heute() >= tagNull };
}

// Laufender Sprint vor geplantem vor geliefertem vor abgeschlossenem; bei
// Gleichstand der jüngste. Ein Projekt öffnet sich immer in diesem Sprint.
const SPRINT_RANG = { laufend: 0, geplant: 1, geliefert: 2, abgeschlossen: 3 };
function sprintJeProjekt(sprints) {
  const besterJe = new Map();
  for (const s of sprints) {
    if (!s.project_id) continue;
    const bisher = besterJe.get(s.project_id);
    if (!bisher) { besterJe.set(s.project_id, s); continue; }
    const ra = SPRINT_RANG[s.status] ?? 2;
    const rb = SPRINT_RANG[bisher.status] ?? 2;
    if (ra < rb || (ra === rb && String(s.created_date || '') > String(bisher.created_date || ''))) {
      besterJe.set(s.project_id, s);
    }
  }
  return besterJe;
}

export async function ladeQuellen(sr) {
  const [clients, projekte, auftraege, rechnungen, anweisungen, angebote, vertraege,
    tickets, sprints, akten, sprintProjekte, threads, meilensteine, profile] = await Promise.all([
    alle(sr, 'Client', '-updated_date', 2000),
    alle(sr, 'LiquidityProject'),
    alle(sr, 'ConfirmedOrder'),
    alle(sr, 'InvoiceRecord'),
    alle(sr, 'BillingInstruction'),
    alle(sr, 'CrmProposal'),
    alle(sr, 'RecurringContract'),
    alle(sr, 'Ticket'),
    alle(sr, 'Sprint', '-created_date', 4000),
    alle(sr, 'ProjectFileEntry', '-updated_date', 2000),
    alle(sr, 'Project', '-updated_date', 2000),
    alle(sr, 'EmailThreadIndex', '-last_message_at', 2000),
    alle(sr, 'Milestone', '-created_date', 6000),
    alle(sr, 'TeamMemberProfile', '-created_date', 200),
  ]);
  const quelle = await zeitQuelle(sr);
  const seit = vorTagen(90);
  const zeiten = quelle.eigene
    ? (await alle(sr, 'TimeEntry', '-entry_date', 4000)).filter((z) => (z.entry_date || '') >= seit)
    : (await alle(sr, 'AworkTimeEntry', '-entry_date', 4000)).filter((z) => (z.entry_date || '') >= seit);

  const kundeNachId = new Map(clients.map((c) => [c.id, c]));
  const projektNachId = new Map(sprintProjekte.map((p) => [p.id, p]));
  const sprintNachId = new Map(sprints.map((s) => [s.id, s]));
  const sprintNachMeilenstein = new Map(meilensteine.map((m) => [m.id, m.sprint_id]));
  const nameNachMail = new Map(
    profile.filter((p) => p.user_email).map((p) => [String(p.user_email).toLowerCase(), p.display_name || '']),
  );
  const verknuepfteCockpits = new Set(sprintProjekte.map((p) => p.liquidity_project_id).filter(Boolean));

  return {
    clients, projekte, auftraege, rechnungen, anweisungen, angebote, vertraege,
    tickets: tickets.filter((t) => !t.archiviert), sprints, akten, sprintProjekte, threads, zeiten,
    eigeneZeit: quelle.eigene,
    kundeNachId, projektNachId, sprintNachId, sprintNachMeilenstein, nameNachMail, verknuepfteCockpits,
    sprintJe: sprintJeProjekt(sprints),
  };
}

// ── Helfer für Projekt und Person ───────────────────────────────────────────
function personName(q, mail) {
  if (!mail) return '';
  const name = q.nameNachMail.get(String(mail).toLowerCase());
  return name || String(mail).split('@')[0];
}
const vorname = (name) => String(name || '').trim().split(/\s+/)[0] || '';

// Dieselbe Ableitung wie projectTypeOf/istWartung im Frontend (src/components/sprint/projectTypes.js).
function projektTyp(p) {
  if (!p) return { wort: 'Projekt', stichworte: [] };
  if (p.is_legacy) return { wort: 'Alt', stichworte: ['altprojekt'] };
  if (p.abrechnungsmodell === 'intern') return { wort: 'Intern', stichworte: ['intern'] };
  if (p.abrechnungsmodell === 'paket') {
    return p.retainer_art === 'wartung'
      ? { wort: 'Wartung', stichworte: ['wartung', 'wartungsvertrag', 'retainer'] }
      : { wort: 'Retainer', stichworte: ['retainer', 'container'] };
  }
  if (p.abrechnungsmodell === 'sprint') return { wort: 'Sprint', stichworte: ['sprint'] };
  return p.aufwand_art === 'regie'
    ? { wort: 'Regie', stichworte: ['regie'] }
    : { wort: 'Support', stichworte: ['support'] };
}

function projektRoute(q, projectId) {
  const sprint = q.sprintJe.get(projectId);
  return sprint ? `/sprint/sprints/${sprint.id}` : '/sprint/projekte';
}

// Aufgabe öffnet sich in ihrem eigenen Sprint, sonst im Sprint des Projekts.
function ticketRoute(q, t) {
  const sprintId = q.sprintNachMeilenstein.get(t.milestone_id);
  if (sprintId && q.sprintNachId.has(sprintId)) return `/sprint/sprints/${sprintId}?aufgabe=${t.id}`;
  const sprint = q.sprintJe.get(t.project_id);
  return sprint ? `/sprint/sprints/${sprint.id}?aufgabe=${t.id}` : '/sprint/projekte';
}

const aktiveProjekteVon = (q, clientId) => q.sprintProjekte.filter(
  (p) => p.client_id === clientId && (p.status || 'aktiv') === 'aktiv',
);

// ── Einzelne Zeilen ─────────────────────────────────────────────────────────
export function zeileKunde(c, q) {
  const aktiv = aktiveProjekteVon(q, c.id);
  const offen = q.rechnungen
    .filter((r) => r.customer_name === c.name && ['open', 'overdue', 'partially_paid'].includes(r.payment_status))
    .reduce((s, r) => s + (Number(r.open_amount) || Number(r.gross_amount) || 0), 0);
  const sprintIds = q.sprintProjekte.filter((p) => p.client_id === c.id).map((p) => p.id);
  const unverrechnet = q.eigeneZeit
    ? q.zeiten.filter((z) => sprintIds.includes(z.project_id) && z.abrechnungsstatus !== 'abgerechnet')
      .reduce((s, z) => s + (Number(z.duration_minutes) || 0), 0) / 60
    : q.zeiten.filter((z) => z.is_billable && !z.is_billed && sprintIds.length && sprintIds.includes(z.project_id))
      .reduce((s, z) => s + (Number(z.duration_minutes) || 0), 0) / 60;
  const offeneTickets = q.tickets.filter((t) => sprintIds.includes(t.project_id) && t.status !== 'erledigt').length;
  const letzte = q.threads.filter((t) => t.customer === c.name).map((t) => t.last_message_at).sort().pop();
  const tageMail = tageSeit(letzte);

  // Es gibt keine Kundenseite: genau ein aktives Projekt → dorthin, sonst die
  // Projektübersicht. Die Projekte stehen ohnehin direkt darunter in der Liste.
  const route = aktiv.length === 1 ? projektRoute(q, aktiv[0].id) : '/sprint/projekte';
  // Interne Adressen (Import-Platzhalter) nicht anzeigen und nicht durchsuchbar
  // machen — sonst liefert „rittler“ jeden Kunden.
  const kontaktMail = /@rittler\.co$/i.test(String(c.contact_email || '')) ? '' : c.contact_email;

  return mach({
    entry_type: 'kunde',
    ref_entity: 'Client',
    ref_id: c.id,
    client_id: c.id,
    client_name: c.name,
    title: c.name,
    subtitle: [c.contact_person, kontaktMail].filter(Boolean).join(' · '),
    side: offen > 0 ? eur(offen) : '',
    side_note: offen > 0 ? 'offen' : '',
    is_due: offen > 0,
    area: 'projects',
    route,
    activity_at: letzte || c.updated_date,
    card: [
      { label: 'Projekte', value: String(aktiv.length), tone: 'plain' },
      { label: 'offen', value: eur(offen), tone: offen > 0 ? 'warn' : 'plain' },
      { label: 'unverrechnet', value: `${unverrechnet.toFixed(1)} h`, tone: unverrechnet > 0 ? 'warn' : 'plain' },
      { label: 'letzte Mail', value: tageMail === null ? '—' : `vor ${tageMail} Tagen`, tone: 'plain' },
    ],
    card_team: [
      { label: 'Projekte', value: String(aktiv.length), tone: 'plain' },
      { label: 'offene Aufgaben', value: String(offeneTickets), tone: 'plain' },
    ],
  }, [c.sevdesk_contact_id]);
}

// Arbeitsprojekt (Entity Project) — die führende Projektzeile.
export function zeileArbeitsprojekt(p, q) {
  const kunde = q.kundeNachId.get(p.client_id);
  const typ = projektTyp(p);
  const pm = personName(q, p.pm_email);
  const abgeschlossen = p.status === 'abgeschlossen';
  const pausiert = p.status === 'pausiert';
  const letzteAufgabe = q.tickets.filter((t) => t.project_id === p.id)
    .map((t) => t.updated_date).filter(Boolean).sort().pop();
  return mach({
    entry_type: 'projekt',
    ref_entity: 'Project',
    ref_id: p.id,
    client_id: p.client_id || '',
    client_name: kunde?.name || '',
    title: p.title,
    subtitle: [kunde?.name, typ.wort, pm, abgeschlossen ? 'abgeschlossen' : (pausiert ? 'pausiert' : null)]
      .filter(Boolean).join(' · '),
    area: 'projects',
    route: projektRoute(q, p.id),
    route_cockpit: p.liquidity_project_id ? `/projects/${p.liquidity_project_id}` : '',
    kuerzel: p.kuerzel,
    weight: abgeschlossen ? 10 : GEWICHT.projekt,
    activity_at: [p.updated_date, letzteAufgabe].filter(Boolean).sort().pop(),
  }, [p.kuerzel, ...typ.stichworte, pm]);
}

// Projekt-Cockpit (LiquidityProject) — Finanzebene, nur mit Finanzrecht sichtbar
// (area backoffice). Ist es mit einem Arbeitsprojekt verknüpft, gibt es keine
// eigene Zeile: dann hängt es als Verweis „Cockpit" am Projekt.
export function zeileCockpit(p, q) {
  if (p.archived_at || q.verknuepfteCockpits.has(p.id)) return null;
  return mach({
    entry_type: 'cockpit',
    ref_entity: 'LiquidityProject',
    ref_id: p.id,
    client_name: p.customer,
    title: `Cockpit · ${p.project_name || 'Projekt'}`,
    subtitle: [p.customer, p.project_manager].filter(Boolean).join(' · '),
    side: p.total_net_amount ? eur(p.total_net_amount) : '',
    side_note: p.open_amount ? `${eur(p.open_amount)} offen` : '',
    area: 'backoffice',
    route: `/projects/${p.id}`,
    activity_at: p.updated_date,
  }, [p.order_number]);
}

export function zeileAuftrag(a) {
  return mach({
    entry_type: 'auftrag',
    ref_entity: 'ConfirmedOrder',
    ref_id: a.id,
    client_name: a.customer,
    title: a.project_name || `Auftrag ${a.order_number || ''}`.trim(),
    subtitle: [a.order_number ? `Auftrag ${a.order_number}` : null, a.customer].filter(Boolean).join(' · '),
    side: a.total_net_amount ? eur(a.total_net_amount) : '',
    area: 'backoffice',
    route: `/confirmed-orders/${a.id}`,
    activity_at: a.confirmation_date || a.updated_date,
  }, [a.order_number]);
}

export function zeileRechnung(r) {
  const ohneProjekt = !r.project_id;
  const tageOffen = ['open', 'overdue', 'partially_paid'].includes(r.payment_status) ? tageSeit(r.due_date) : null;
  return mach({
    entry_type: 'rechnung',
    ref_entity: 'InvoiceRecord',
    ref_id: r.id,
    client_name: r.customer_name,
    title: `Rechnung ${r.invoice_number || ''}`.trim(),
    subtitle: ohneProjekt ? 'ohne Projektzuordnung — bitte zuordnen' : r.customer_name,
    side: r.gross_amount ? eur(r.gross_amount) : '',
    side_note: tageOffen > 0 ? `${tageOffen} Tage offen` : '',
    is_due: tageOffen > 0,
    area: 'backoffice',
    route: ohneProjekt ? '/invoice-matching' : '/receivables',
    activity_at: r.invoice_date || r.updated_date,
  }, [r.invoice_number]);
}

export function zeileAnweisung(b) {
  return mach({
    entry_type: 'anweisung',
    ref_entity: 'BillingInstruction',
    ref_id: b.id,
    client_name: b.customer_name,
    title: `Abrechnung ${b.project_name || b.customer_name || ''}`.trim(),
    subtitle: [b.customer_name, b.status].filter(Boolean).join(' · '),
    side: b.instruction_amount_net ? eur(b.instruction_amount_net) : '',
    side_note: b.planned_invoice_date || '',
    area: 'backoffice',
    route: '/invoice-ready',
    activity_at: b.planned_invoice_date || b.updated_date,
  });
}

export function zeileAngebot(a) {
  return mach({
    entry_type: 'angebot',
    ref_entity: 'CrmProposal',
    ref_id: a.id,
    client_name: a.customer_company,
    title: a.title,
    subtitle: [a.customer_company, a.status].filter(Boolean).join(' · '),
    area: 'sales',
    route: `/crm/proposals/${a.id}`,
    activity_at: a.updated_date,
  });
}

const VERTRAG_ZIEL = {
  online_marketing: '/online-marketing',
  maintenance: '/maintenance',
  support: '/maintenance',
  hosting: '/hosting',
  domain: '/hosting',
};

export function zeileVertrag(v) {
  return mach({
    entry_type: 'vertrag',
    ref_entity: 'RecurringContract',
    ref_id: v.id,
    client_name: v.customer,
    title: v.project_name || v.domain || v.contract_type,
    subtitle: [v.customer, v.contract_type].filter(Boolean).join(' · '),
    side: v.monthly_fixed_price ? `${eur(v.monthly_fixed_price)}/Mon.` : (v.annual_amount ? `${eur(v.annual_amount)}/Jahr` : ''),
    area: 'backoffice',
    route: VERTRAG_ZIEL[v.contract_type] || '/maintenance',
    activity_at: v.updated_date,
  }, [v.domain, v.order_number]);
}

export function zeileTicket(t, q) {
  const projekt = q.projektNachId.get(t.project_id);
  const kundeName = q.kundeNachId.get(projekt?.client_id)?.name || t.customer_name || '';
  const person = personName(q, t.assignee_email);
  const pfad = [kundeName, projekt?.title].filter(Boolean).join(' › ');
  return mach({
    entry_type: 'ticket',
    ref_entity: 'Ticket',
    ref_id: t.id,
    client_id: projekt?.client_id || '',
    client_name: kundeName,
    title: t.title,
    subtitle: [pfad, STATUS_TEXT[t.status] || t.status, vorname(person)].filter(Boolean).join(' · '),
    area: 'projects',
    owner_email: t.assignee_email || '',
    route: ticketRoute(q, t),
    kuerzel: projekt?.kuerzel,
    ist_erledigt: t.status === 'erledigt',
    activity_at: t.last_status_change || t.updated_date,
  }, [projekt?.kuerzel, person]);
}

export function zeileAkte(a, q) {
  const projekt = q.projekte.find((p) => p.id === a.project_id);
  return mach({
    entry_type: 'akte',
    ref_entity: 'ProjectFileEntry',
    ref_id: a.id,
    client_name: projekt?.customer || '',
    title: a.title || 'Kundenakt-Eintrag',
    subtitle: String(a.content || a.ai_summary || '').slice(0, 120),
    area: 'projects',
    route: `/projects/${a.project_id}`,
    activity_at: a.entry_date || a.updated_date,
  });
}

export function zeilenNavigation() {
  return NAV_TARGETS.map((n) => mach({
    entry_type: 'seite',
    ref_entity: 'Navigation',
    ref_id: n.path,
    title: n.label,
    subtitle: n.path,
    area: n.area,
    route: n.path,
  }));
}

// ── Voller Lauf ─────────────────────────────────────────────────────────────
// Sprints und Zeitbuchungen sind keine eigenen Treffer mehr: das Projekt führt
// in den laufenden Sprint, Zeiten stehen unter /zeiten.
export async function baueAlleZeilen(sr) {
  const q = await ladeQuellen(sr);
  return [
    ...q.clients.map((c) => zeileKunde(c, q)),
    ...q.sprintProjekte.map((p) => zeileArbeitsprojekt(p, q)),
    ...q.projekte.map((p) => zeileCockpit(p, q)),
    ...q.auftraege.map(zeileAuftrag),
    ...q.rechnungen.map(zeileRechnung),
    ...q.anweisungen.map(zeileAnweisung),
    ...q.angebote.map(zeileAngebot),
    ...q.vertraege.map(zeileVertrag),
    ...q.tickets.map((t) => zeileTicket(t, q)),
    ...q.akten.map((a) => zeileAkte(a, q)),
    ...zeilenNavigation(),
  ].filter(Boolean);
}

// ── Einzelne Zeilen neu bauen ───────────────────────────────────────────────
// Ein Bauer liefert null, wenn es zu dem Datensatz keine Zeile (mehr) gibt —
// die vorhandene Zeile wird dann deaktiviert.
const BAUER = {
  Client: zeileKunde,
  Project: zeileArbeitsprojekt,
  LiquidityProject: zeileCockpit,
  ConfirmedOrder: (r) => zeileAuftrag(r),
  InvoiceRecord: (r) => zeileRechnung(r),
  BillingInstruction: (r) => zeileAnweisung(r),
  CrmProposal: (r) => zeileAngebot(r),
  RecurringContract: (r) => zeileVertrag(r),
  Ticket: (r, q) => (r.archiviert ? null : zeileTicket(r, q)),
  ProjectFileEntry: zeileAkte,
  // Keine eigenen Zeilen mehr — vorhandene Altzeilen werden deaktiviert.
  Sprint: () => null,
  TimeEntry: () => null,
  AworkTimeEntry: () => null,
};

export const BEKANNTE_ENTITIES = Object.keys(BAUER);

// Welche weiteren Zeilen hängen an einer Änderung? (Projekt zeigt Sprint und
// Aktivität seiner Aufgaben, Kunde zeigt seine Projekte, Projekt den Cockpit-Verweis.)
function abhaengige(entity, datensatz) {
  if (!datensatz) return [];
  if (entity === 'Ticket' && datensatz.project_id) return [{ entity: 'Project', id: datensatz.project_id }];
  if (entity === 'Sprint' && datensatz.project_id) return [{ entity: 'Project', id: datensatz.project_id }];
  if (entity === 'Project') {
    const folgen = [];
    if (datensatz.client_id) folgen.push({ entity: 'Client', id: datensatz.client_id });
    if (datensatz.liquidity_project_id) folgen.push({ entity: 'LiquidityProject', id: datensatz.liquidity_project_id });
    return folgen;
  }
  return [];
}

async function holeDatensatz(sr, entity, id) {
  try {
    return await sr.entities[entity].get(id);
  } catch (e) {
    return null;
  }
}

// Mehrere Datensätze in einem Lauf — die Quellen werden nur einmal geladen.
// Liefert [{ entity, id, zeile }] (zeile null = deaktivieren).
export async function baueZeilen(sr, eintraege) {
  const offen = [];
  const gesehen = new Set();
  const merke = (entity, id) => {
    const key = `${entity}:${id}`;
    if (!id || !BAUER[entity] || gesehen.has(key)) return;
    gesehen.add(key);
    offen.push({ entity, id });
  };
  eintraege.forEach((e) => merke(e.entity, e.id));

  const datensaetze = new Map();
  for (let i = 0; i < offen.length; i++) {
    const { entity, id } = offen[i];
    const d = await holeDatensatz(sr, entity, id);
    datensaetze.set(`${entity}:${id}`, d);
    abhaengige(entity, d).forEach((f) => merke(f.entity, f.id));
  }

  const q = await ladeQuellen(sr);
  return offen.map(({ entity, id }) => {
    const d = datensaetze.get(`${entity}:${id}`);
    return { entity, id, zeile: d ? BAUER[entity](d, q) : null };
  });
}

export async function baueEineZeile(sr, entity, id) {
  const [erste] = await baueZeilen(sr, [{ entity, id }]);
  return erste?.zeile || null;
}
