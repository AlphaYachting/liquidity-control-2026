import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Hilfsaktionen der Support-Abrechnung für erledigte App-Tickets.
// Eingabe: { aktion, ... }
//   nicht_verrechnen  { ticket_id, grund, notiz }        → Ticket bewusst ohne Rechnung abschließen (Führung)
//   rueckgaengig      { ticket_id }                       → „nicht verrechnen" zurücknehmen (Führung)
//   awork_vorschlag   { ticket_id }                       → offene aWork-Support-Aufgaben als Vorschlag (lesen)
//   awork_zuordnen    { ticket_id, awork_task_id }        → aWork-Zeit als Vorleistung ans Ticket hängen (Führung)
//   awork_loesen      { ticket_id }                       → Zuordnung wieder lösen (Führung, nur solange nicht verrechnet)
//   leistungstext     { ticket_ids }                      → Vorschlag für den Rechnungstext je Ticket (lesen)
//   sevdesk_verknuepfen { client_id, kontakt }            → Kunde der App mit sevDesk-Kontakt verknüpfen (Führung)
// Zeitbuchungen werden hier nie verändert — ein „nicht verrechnet"-Ticket fällt nur aus der Abrechnungsliste.

const GRUENDE = ['wartungsvertrag', 'anderer_auftrag', 'kulanz', 'keine_gesonderte_abrechnung', 'sonstiges'];
const AWORK_SUPPORT_PROJEKT = 'RITTLER - Supportanfragen';
const STICHTAG = '2026-07-24';
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');

async function alleSeiten(fetcher) {
  const out = [];
  let offset = 0;
  while (true) {
    const page = await fetcher(500, offset);
    out.push(...page);
    if (page.length < 500 || offset > 20000) break;
    offset += 500;
  }
  return out;
}

async function istFuehrung(db, user) {
  if (user.role === 'admin') return true;
  const person = (await db.TeamMember.filter({ email: user.email }, 'name', 1))[0];
  return person?.system_role === 'gf' && person?.active !== false;
}

// aWork-Aufgaben, die schon einem Ticket oder einer Abrechnung gehören
async function belegteAworkAufgaben(db, ausserTicketId) {
  const belegt = new Set();
  const tickets = await alleSeiten((l, o) => db.Ticket.filter({ awork_task_id: { $ne: null } }, '-updated_date', l, o));
  tickets.forEach((t) => { if (t.awork_task_id && t.id !== ausserTicketId) belegt.add(t.awork_task_id); });
  const anweisungen = await alleSeiten((l, o) => db.BillingInstruction.list('-created_date', l, o));
  for (const a of anweisungen) {
    if (a.status === 'cancelled') continue;
    let snap = null;
    try { snap = a.source_snapshot_json ? JSON.parse(a.source_snapshot_json) : null; } catch (_e) { snap = null; }
    [...(snap?.support_task_ids || []), ...(snap?.awork_vorleistung_task_ids || [])].forEach((id) => belegt.add(id));
  }
  return belegt;
}

function kundePasst(titel, kundenname) {
  const praefix = norm(String(titel || '').split(/\s[-–|]\s/)[0]);
  const kunde = norm(kundenname);
  if (!praefix || !kunde) return 0;
  if (kunde.startsWith(praefix) || praefix.startsWith(kunde)) return 2;
  const erstesWort = norm(String(kundenname).split(/\s+/)[0]);
  if (erstesWort.length >= 3 && praefix.startsWith(erstesWort)) return 1;
  return 0;
}

// Zugangsdaten dürfen nie in einen Rechnungstext
const SENSIBEL = /(passw|password|kennwort|lozinka|benutzername|username|korisničko|login|zugangsdaten|ftp|cpanel|iban|\b\d{6,}\b)/i;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { aktion } = body;
    const db = base44.asServiceRole.entities;
    const jetzt = new Date().toISOString();
    const schreibend = ['nicht_verrechnen', 'rueckgaengig', 'awork_zuordnen', 'awork_loesen', 'sevdesk_verknuepfen'];
    if (schreibend.includes(aktion) && !(await istFuehrung(db, user))) {
      return Response.json({ error: 'Nur Führungskräfte oder Admins dürfen das ändern' }, { status: 403 });
    }

    const ladeTicket = async (id) => (await db.Ticket.filter({ id }))[0] || null;

    if (aktion === 'nicht_verrechnen') {
      const { ticket_id, grund } = body;
      const notiz = String(body.notiz || '').trim();
      if (!GRUENDE.includes(grund)) return Response.json({ error: 'Bitte einen Grund wählen' }, { status: 400 });
      if (grund === 'sonstiges' && !notiz) return Response.json({ error: 'Bei „Sonstiges" bitte eine Notiz angeben' }, { status: 400 });
      const t = await ladeTicket(ticket_id);
      if (!t) return Response.json({ error: 'Ticket nicht gefunden' }, { status: 404 });
      if (t.verrechnung_status === 'verrechnet') return Response.json({ error: 'Ticket ist bereits verrechnet — erst die Abrechnung zurücknehmen' }, { status: 409 });
      await db.Ticket.update(t.id, {
        verrechnung_status: 'nicht_verrechnen', verrechnung_grund: grund, verrechnung_notiz: notiz || null,
        verrechnung_von: user.email, verrechnung_am: jetzt,
      });
      return Response.json({ success: true });
    }

    if (aktion === 'rueckgaengig') {
      const t = await ladeTicket(body.ticket_id);
      if (!t) return Response.json({ error: 'Ticket nicht gefunden' }, { status: 404 });
      if (t.verrechnung_status !== 'nicht_verrechnen') return Response.json({ error: 'Ticket ist nicht als „nicht verrechnen" gekennzeichnet' }, { status: 409 });
      await db.Ticket.update(t.id, {
        verrechnung_status: 'offen', verrechnung_grund: null, verrechnung_notiz: null, verrechnung_von: null, verrechnung_am: null,
      });
      return Response.json({ success: true });
    }

    if (aktion === 'awork_vorschlag') {
      const t = await ladeTicket(body.ticket_id);
      if (!t) return Response.json({ error: 'Ticket nicht gefunden' }, { status: 404 });
      const projekt = (await db.Project.filter({ id: t.project_id }))[0] || null;
      const kunde = projekt?.client_id ? (await db.Client.filter({ id: projekt.client_id }))[0] : null;
      const kundenname = kunde?.name || t.customer_name || '';

      const eintraege = (await alleSeiten((l, o) => db.AworkTimeEntry.filter(
        { project_name: AWORK_SUPPORT_PROJEKT, entry_date: { $gte: STICHTAG } }, '-entry_date', l, o,
      ))).filter((e) => e.task_id && e.is_billed !== true);
      const belegt = await belegteAworkAufgaben(db, t.id);

      const proAufgabe = {};
      for (const e of eintraege) {
        if (belegt.has(e.task_id)) continue;
        const a = proAufgabe[e.task_id] = proAufgabe[e.task_id] || {
          awork_task_id: e.task_id, titel: e.task_name || '', minuten: 0, letzte: null, personen: new Set(),
        };
        a.minuten += Number(e.duration_minutes) || 0;
        if (!a.letzte || (e.entry_date || '') > a.letzte) a.letzte = e.entry_date || null;
        if (e.user_name) a.personen.add(e.user_name);
      }
      const vorschlaege = Object.values(proAufgabe)
        .map((a) => ({ ...a, personen: [...a.personen].join(', '), passt: kundePasst(a.titel, kundenname) }))
        .sort((a, b) => (b.passt - a.passt) || String(b.letzte || '').localeCompare(String(a.letzte || '')))
        .slice(0, 40);
      return Response.json({ success: true, kunde: kundenname, aktuell: t.awork_task_id || null, vorschlaege });
    }

    if (aktion === 'awork_zuordnen') {
      const { ticket_id, awork_task_id } = body;
      const t = await ladeTicket(ticket_id);
      if (!t) return Response.json({ error: 'Ticket nicht gefunden' }, { status: 404 });
      if (!awork_task_id) return Response.json({ error: 'Keine aWork-Aufgabe gewählt' }, { status: 400 });
      if (t.verrechnung_status === 'verrechnet') return Response.json({ error: 'Ticket ist bereits verrechnet' }, { status: 409 });
      if (t.awork_task_id && t.awork_task_id !== awork_task_id) {
        return Response.json({ error: 'Dem Ticket ist schon eine andere aWork-Aufgabe zugeordnet — erst lösen' }, { status: 409 });
      }
      const belegt = await belegteAworkAufgaben(db, t.id);
      if (belegt.has(awork_task_id)) return Response.json({ error: 'Diese aWork-Aufgabe gehört schon zu einem anderen Ticket oder ist verrechnet' }, { status: 409 });
      const eintraege = (await alleSeiten((l, o) => db.AworkTimeEntry.filter({ task_id: awork_task_id }, '-entry_date', l, o)))
        .filter((e) => (e.entry_date || '') >= STICHTAG && e.is_billed !== true);
      const minuten = eintraege.reduce((s, e) => s + (Number(e.duration_minutes) || 0), 0);
      if (minuten <= 0) return Response.json({ error: 'Auf dieser aWork-Aufgabe gibt es keine offene Zeit seit 24.07.2026' }, { status: 400 });
      await db.Ticket.update(t.id, { awork_task_id, awork_vorleistung_minuten: minuten, awork_vorleistung_abgerechnet: false });
      return Response.json({ success: true, minuten });
    }

    if (aktion === 'awork_loesen') {
      const t = await ladeTicket(body.ticket_id);
      if (!t) return Response.json({ error: 'Ticket nicht gefunden' }, { status: 404 });
      if (t.verrechnung_status === 'verrechnet' || t.awork_vorleistung_abgerechnet) {
        return Response.json({ error: 'Die aWork-Zeit ist bereits verrechnet — erst die Abrechnung zurücknehmen' }, { status: 409 });
      }
      await db.Ticket.update(t.id, { awork_task_id: null, awork_vorleistung_minuten: null, awork_vorleistung_abgerechnet: false });
      return Response.json({ success: true });
    }

    if (aktion === 'leistungstext') {
      const ids = (body.ticket_ids || []).filter(Boolean).slice(0, 30);
      if (!ids.length) return Response.json({ success: true, texte: {} });
      const tickets = await db.Ticket.filter({ id: { $in: ids } }, null, 100);
      const fallback = Object.fromEntries(tickets.map((t) => [t.id, t.title || '']));
      const quelle = tickets.map((t) => {
        const beschreibung = String(t.description || '').split('— Vollständiger E-Mail-Verlauf —')[0].trim().slice(0, 3000);
        return `TICKET ${t.id}\nTITEL: ${t.title || ''}\nINHALT:\n${beschreibung || '(keine Beschreibung)'}`;
      }).join('\n\n=====\n\n');

      let texte = { ...fallback };
      try {
        const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `Du formulierst Rechnungspositionen einer Webagentur für erledigte Support-Anfragen.
Schreibe je Ticket einen sachlichen Leistungstext auf Deutsch: ein bis höchstens drei kurze Sätze, was für den Kunden erledigt wurde (z. B. „Fehler bei der Versandkostenberechnung im Shop analysiert und behoben."). Kein Anrede-, Dank- oder Grußtext, keine Uhrzeiten, keine Stundenangaben.
STRENG VERBOTEN im Text: Passwörter, Benutzernamen, Zugangsdaten, Server- oder FTP-Angaben, Bankdaten, E-Mail-Adressen, Telefonnummern, Namen von Personen, Bestell- oder Rechnungsnummern von Endkunden. Wenn der Inhalt nur aus solchen Daten besteht, beschreibe die Leistung allgemein (z. B. „Zugangsdaten des Hostings geprüft und Funktion wiederhergestellt.").
Erfinde nichts, was nicht im Inhalt steht. Antworte für jedes Ticket mit seiner ID.

${quelle}`,
          response_json_schema: {
            type: 'object',
            properties: {
              positionen: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { ticket_id: { type: 'string' }, text: { type: 'string' } },
                  required: ['ticket_id', 'text'],
                },
              },
            },
            required: ['positionen'],
          },
        });
        for (const p of res?.positionen || []) {
          const text = String(p.text || '').trim();
          if (!fallback[p.ticket_id] && fallback[p.ticket_id] !== '') continue;
          if (text && !SENSIBEL.test(text)) texte[p.ticket_id] = text;
        }
      } catch (_e) {
        texte = { ...fallback };
      }
      return Response.json({ success: true, texte });
    }

    if (aktion === 'sevdesk_verknuepfen') {
      const { client_id, kontakt } = body;
      const sevId = String(kontakt?.sevdesk_contact_id || '').trim();
      if (!client_id || !sevId) return Response.json({ error: 'Kunde oder sevDesk-Kontakt fehlt' }, { status: 400 });
      const kunde = (await db.Client.filter({ id: client_id }))[0];
      if (!kunde) return Response.json({ error: 'Kunde nicht gefunden' }, { status: 404 });
      const doppelt = (await db.Client.filter({ sevdesk_contact_id: sevId })).filter((c) => c.id !== client_id);
      if (doppelt.length) {
        return Response.json({ error: `Dieser sevDesk-Kontakt ist schon mit „${doppelt[0].name}" verknüpft — bitte im Kundenverzeichnis zusammenführen` }, { status: 409 });
      }
      // Nur Leeres ergänzen — vorhandene Adressdaten des Kunden bleiben unverändert
      const daten = { sevdesk_contact_id: sevId };
      for (const f of ['street', 'zip', 'city', 'country_code']) {
        if (!kunde[f] && kontakt?.[f]) daten[f] = kontakt[f];
      }
      await db.Client.update(kunde.id, daten);
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unbekannte Aktion' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
