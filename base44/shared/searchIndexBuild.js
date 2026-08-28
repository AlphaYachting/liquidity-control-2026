// Aufbau des Suchindex. Eine Stelle für den vollen Lauf und für die
// Einzelauffrischung — damit eine Zeile nach dem Speichern genauso aussieht
// wie nach dem nächtlichen Lauf.
import { haystackVon } from './searchNormalize.js';
import { NAV_TARGETS } from './navTargets.js';

export const GEWICHT = {
  kunde: 60, projekt: 45, auftrag: 35, seite: 34, rechnung: 30,
  anweisung: 28, angebot: 28, ticket: 25, vertrag: 22, sprint: 20,
  akte: 14, zeit: 12,
};

const eur = (n) => `${Math.round(Number(n) || 0).toLocaleString('de-AT')} €`;
const tag = (d) => (d ? String(d).slice(0, 10) : null);
const heute = () => new Date().toISOString().slice(0, 10);
const vorTagen = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const tageSeit = (d) => (d ? Math.round((Date.now() - new Date(d).getTime()) / 86400000) : null);

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
    activity_at: tag(o.activity_at),
    weight: GEWICHT[o.entry_type] || 10,
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

export async function ladeQuellen(sr) {
  const [clients, projekte, auftraege, rechnungen, anweisungen, angebote, vertraege,
    tickets, sprints, akten, sprintProjekte, threads] = await Promise.all([
    alle(sr, 'Client', '-updated_date', 2000),
    alle(sr, 'LiquidityProject'),
    alle(sr, 'ConfirmedOrder'),
    alle(sr, 'InvoiceRecord'),
    alle(sr, 'BillingInstruction'),
    alle(sr, 'CrmProposal'),
    alle(sr, 'RecurringContract'),
    alle(sr, 'Ticket'),
    alle(sr, 'Sprint'),
    alle(sr, 'ProjectFileEntry', '-updated_date', 2000),
    alle(sr, 'Project', '-updated_date', 2000),
    alle(sr, 'EmailThreadIndex', '-last_message_at', 2000),
  ]);
  const quelle = await zeitQuelle(sr);
  const seit = vorTagen(90);
  const zeiten = quelle.eigene
    ? (await alle(sr, 'TimeEntry', '-entry_date', 4000)).filter((z) => (z.entry_date || '') >= seit)
    : (await alle(sr, 'AworkTimeEntry', '-entry_date', 4000)).filter((z) => (z.entry_date || '') >= seit);
  return {
    clients, projekte, auftraege, rechnungen, anweisungen, angebote, vertraege,
    tickets, sprints, akten, sprintProjekte, threads, zeiten, eigeneZeit: quelle.eigene,
  };
}

// ── Einzelne Zeilen ─────────────────────────────────────────────────────────
export function zeileKunde(c, q) {
  const projekte = q.projekte.filter((p) => p.customer === c.name && p.is_active_for_billing !== false && !p.archived_at);
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

  return mach({
    entry_type: 'kunde',
    ref_entity: 'Client',
    ref_id: c.id,
    client_id: c.id,
    client_name: c.name,
    title: c.name,
    subtitle: [c.contact_person, c.contact_email].filter(Boolean).join(' · '),
    side: offen > 0 ? eur(offen) : '',
    side_note: offen > 0 ? 'offen' : '',
    is_due: offen > 0,
    area: 'projects',
    route: `/clients/${c.id}`,
    activity_at: letzte || c.updated_date,
    card: [
      { label: 'Projekte', value: String(projekte.length), tone: 'plain' },
      { label: 'offen', value: eur(offen), tone: offen > 0 ? 'warn' : 'plain' },
      { label: 'unverrechnet', value: `${unverrechnet.toFixed(1)} h`, tone: unverrechnet > 0 ? 'warn' : 'plain' },
      { label: 'letzte Mail', value: tageMail === null ? '—' : `vor ${tageMail} Tagen`, tone: 'plain' },
    ],
    card_team: [
      { label: 'Projekte', value: String(projekte.length), tone: 'plain' },
      { label: 'offene Tickets', value: String(offeneTickets), tone: 'plain' },
    ],
  }, [c.sevdesk_contact_id]);
}

export function zeileProjekt(p) {
  return mach({
    entry_type: 'projekt',
    ref_entity: 'LiquidityProject',
    ref_id: p.id,
    client_name: p.customer,
    title: p.project_name,
    subtitle: [p.customer, p.project_manager].filter(Boolean).join(' · '),
    side: p.total_net_amount ? eur(p.total_net_amount) : '',
    side_note: p.open_amount ? `${eur(p.open_amount)} offen` : '',
    area: 'projects',
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
    route: ohneProjekt ? `/invoice-matching/${r.invoice_number}` : `/receivables/${r.invoice_number}`,
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
    route: `/invoice-ready/${b.id}`,
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
    route: `/recurring/${v.id}`,
    activity_at: v.updated_date,
  }, [v.domain, v.order_number]);
}

export function zeileTicket(t, q) {
  const projekt = q.sprintProjekte.find((p) => p.id === t.project_id);
  return mach({
    entry_type: 'ticket',
    ref_entity: 'Ticket',
    ref_id: t.id,
    client_id: projekt?.client_id || '',
    client_name: t.customer_name || q.clients.find((c) => c.id === projekt?.client_id)?.name || '',
    title: t.title,
    subtitle: [projekt?.title, t.status].filter(Boolean).join(' · '),
    area: 'projects',
    owner_email: t.assignee_email || '',
    route: `/sprint/tickets/${t.id}`,
    activity_at: t.last_status_change || t.updated_date,
  }, [projekt?.kuerzel]);
}

export function zeileSprint(s, q) {
  const projekt = q.sprintProjekte.find((p) => p.id === s.project_id);
  return mach({
    entry_type: 'sprint',
    ref_entity: 'Sprint',
    ref_id: s.id,
    client_id: projekt?.client_id || '',
    client_name: q.clients.find((c) => c.id === projekt?.client_id)?.name || '',
    title: s.title || `Sprint ${s.size || ''}`.trim(),
    subtitle: [projekt?.title, s.status].filter(Boolean).join(' · '),
    side: s.sprint_amount ? eur(s.sprint_amount) : '',
    side_note: s.delivery_date || '',
    area: 'projects',
    route: `/sprint/planung/${s.id}`,
    activity_at: s.end_date || s.start_date,
  }, [projekt?.kuerzel]);
}

export function zeileZeit(z, q) {
  const eigene = q.eigeneZeit;
  const projekt = eigene ? q.sprintProjekte.find((p) => p.id === z.project_id) : null;
  const stunden = (Number(z.duration_minutes) || 0) / 60;
  return mach({
    entry_type: 'zeit',
    ref_entity: eigene ? 'TimeEntry' : 'AworkTimeEntry',
    ref_id: z.id,
    client_id: projekt?.client_id || '',
    client_name: eigene
      ? (q.clients.find((c) => c.id === projekt?.client_id)?.name || '')
      : (z.project_name || ''),
    title: z.note || 'Zeitbuchung',
    subtitle: [z.entry_date, eigene ? projekt?.title : z.project_name].filter(Boolean).join(' · '),
    side: `${stunden.toFixed(2)} h`,
    area: 'projects',
    owner_email: eigene ? (z.person_email || '') : '',
    route: `/sprint/zeiten/${z.id}`,
    activity_at: z.entry_date,
  }, [eigene ? projekt?.kuerzel : z.project_key]);
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
    route: `/projects/${a.project_id}/akte`,
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
export async function baueAlleZeilen(sr) {
  const q = await ladeQuellen(sr);
  return [
    ...q.clients.map((c) => zeileKunde(c, q)),
    ...q.projekte.filter((p) => !p.archived_at).map(zeileProjekt),
    ...q.auftraege.map(zeileAuftrag),
    ...q.rechnungen.map(zeileRechnung),
    ...q.anweisungen.map(zeileAnweisung),
    ...q.angebote.map(zeileAngebot),
    ...q.vertraege.map(zeileVertrag),
    ...q.tickets.map((t) => zeileTicket(t, q)),
    ...q.sprints.filter((s) => s.status !== 'abgeschlossen').map((s) => zeileSprint(s, q)),
    ...q.zeiten.map((z) => zeileZeit(z, q)),
    ...q.akten.map((a) => zeileAkte(a, q)),
    ...zeilenNavigation(),
  ];
}

// ── Eine Zeile neu bauen ────────────────────────────────────────────────────
const BAUER = {
  Client: zeileKunde,
  LiquidityProject: (r) => zeileProjekt(r),
  ConfirmedOrder: (r) => zeileAuftrag(r),
  InvoiceRecord: (r) => zeileRechnung(r),
  BillingInstruction: (r) => zeileAnweisung(r),
  CrmProposal: (r) => zeileAngebot(r),
  RecurringContract: (r) => zeileVertrag(r),
  Ticket: zeileTicket,
  Sprint: zeileSprint,
  TimeEntry: zeileZeit,
  AworkTimeEntry: zeileZeit,
  ProjectFileEntry: zeileAkte,
};

export async function baueEineZeile(sr, entity, id) {
  const bauer = BAUER[entity];
  if (!bauer) return null;
  const datensatz = await sr.entities[entity].get(id);
  if (!datensatz) return null;
  const q = await ladeQuellen(sr);
  return bauer(datensatz, q);
}