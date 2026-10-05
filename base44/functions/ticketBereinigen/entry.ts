import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Tickets archivieren, wiederherstellen, Routinen beenden, löschen — alle Prüfungen hier auf dem Server.
// Eingabe: { aktion: 'pruefen'|'archivieren'|'wiederherstellen'|'routine_beenden'|'loeschen', ticket_ids: string[], grund?: string }
// Rechte: archivieren / wiederherstellen / routine_beenden → Admin, Führungskraft (Stufe gf) oder Projektverantwortlicher
// (Entscheidung 05.10.2026: Führungskräfte in allen Projekten); loeschen → nur Admin.
// Zeitbuchungen, Abrechnung und Saldo werden nie verändert.

const GRUENDE = ['doppelt', 'nicht_mehr_relevant', 'storniert', 'altbestand_awork', 'routine_beendet', 'projekt_abgeschlossen', 'sonstiges'];
const GRUND_LABEL = {
  doppelt: 'doppelt angelegt',
  nicht_mehr_relevant: 'nicht mehr relevant',
  storniert: 'vom Kunden storniert',
  altbestand_awork: 'Altbestand aWork',
  routine_beendet: 'Routine beendet',
  projekt_abgeschlossen: 'Projekt abgeschlossen',
  sonstiges: 'sonstiges',
};
const MAX = 300;

const zaehle = (liste, feld) => liste.reduce((m, r) => {
  const k = r[feld];
  if (k) m[k] = (m[k] || 0) + 1;
  return m;
}, {});

async function inBloecken(ids, fn, groesse = 100) {
  const ergebnis = [];
  for (let i = 0; i < ids.length; i += groesse) {
    ergebnis.push(...(await fn(ids.slice(i, i + groesse))));
  }
  return ergebnis;
}

async function pruefe(db, tickets) {
  const ids = tickets.map((t) => t.id);
  const [buchungen, timer, kommentare, nachfolger] = await Promise.all([
    inBloecken(ids, (b) => db.TimeEntry.filter({ ticket_id: { $in: b } }, null, 5000)),
    inBloecken(ids, (b) => db.LaufendeZeitbuchung.filter({ ticket_id: { $in: b } }, null, 500)),
    inBloecken(ids, (b) => db.Comment.filter({ ticket_id: { $in: b } }, null, 5000)),
    inBloecken(ids, (b) => db.Ticket.filter({ vorgaenger_id: { $in: b } }, null, 5000)),
  ]);
  const nBuchung = zaehle(buchungen, 'ticket_id');
  const nTimer = zaehle(timer, 'ticket_id');
  const nKommentar = zaehle(kommentare.filter((c) => c.author_email !== 'System'), 'ticket_id');
  const nNachfolger = zaehle(nachfolger, 'vorgaenger_id');
  return tickets.map((t) => {
    const gruende = [];
    if (nTimer[t.id]) gruende.push('Timer läuft');
    if (nBuchung[t.id]) gruende.push(`${nBuchung[t.id]} Zeitbuchung${nBuchung[t.id] === 1 ? '' : 'en'}`);
    if (nKommentar[t.id]) gruende.push(`${nKommentar[t.id]} Kommentar${nKommentar[t.id] === 1 ? '' : 'e'}`);
    if (nNachfolger[t.id]) gruende.push('ist Vorgänger einer Routine');
    return {
      id: t.id,
      titel: t.title,
      loeschbar: gruende.length === 0,
      timer_laeuft: !!nTimer[t.id],
      grund_nicht_loeschbar: gruende.join(', '),
    };
  });
}

async function suchindexAktiv(db, ids, aktiv) {
  try {
    const zeilen = await inBloecken(ids, (b) => db.SearchIndexEntry.filter({ ref_entity: 'Ticket', ref_id: { $in: b } }, null, 1000));
    await Promise.all(zeilen.map((z) => db.SearchIndexEntry.update(z.id, { is_active: aktiv })));
  } catch (_) { /* Suchindex ist nicht kritisch */ }
}

const systemEintrag = (db, t, text) => db.Comment.create({
  project_id: t.project_id,
  milestone_id: t.milestone_id || undefined,
  ticket_id: t.id,
  author_email: 'System',
  text,
  created_at: new Date().toISOString(),
});

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const aktion = body.aktion;
    const ids = [...new Set((body.ticket_ids || []).filter(Boolean))];
    if (!['pruefen', 'archivieren', 'wiederherstellen', 'routine_beenden', 'loeschen'].includes(aktion)) {
      return Response.json({ error: 'unbekannte Aktion' }, { status: 400 });
    }
    if (!ids.length) return Response.json({ error: 'ticket_ids fehlt' }, { status: 400 });
    if (ids.length > MAX) return Response.json({ error: `höchstens ${MAX} Tickets je Aufruf` }, { status: 400 });

    const istAdmin = user.role === 'admin';
    if (aktion === 'loeschen' && !istAdmin) {
      return Response.json({ error: 'Verboten — Löschen nur für Admins' }, { status: 403 });
    }

    const db = base44.asServiceRole.entities;
    const tickets = await inBloecken(ids, (b) => db.Ticket.filter({ id: { $in: b } }, null, 1000));
    if (!tickets.length) return Response.json({ error: 'Tickets nicht gefunden' }, { status: 404 });

    // Rechte je Projekt
    const projektIds = [...new Set(tickets.map((t) => t.project_id).filter(Boolean))];
    const projekte = await db.Project.filter({ id: { $in: projektIds } }, null, 500);
    const projektById = Object.fromEntries(projekte.map((p) => [p.id, p]));
    // Führungskräfte (Stufe „gf“ in der Personenliste) dürfen wie Admins in jedem Projekt archivieren
    const person = istAdmin ? null : (await db.TeamMember.filter({ email: user.email }, 'name', 1))[0];
    const istFuehrung = istAdmin || (person?.system_role === 'gf' && person?.active !== false);
    const darf = (t) => istFuehrung || (projektById[t.project_id]?.pm_email || '').toLowerCase() === (user.email || '').toLowerCase();
    const verboten = tickets.filter((t) => !darf(t));
    if (verboten.length) {
      return Response.json({ error: 'Verboten — nur Projektverantwortliche, Führungskräfte oder Admins', tickets: verboten.map((t) => t.title) }, { status: 403 });
    }

    const pruefung = await pruefe(db, tickets);
    const pruefById = Object.fromEntries(pruefung.map((p) => [p.id, p]));
    if (aktion === 'pruefen') return Response.json({ tickets: pruefung });

    const jetzt = new Date().toISOString();
    const name = user.full_name || user.email;
    const erledigt = [];
    const abgelehnt = [];

    if (aktion === 'archivieren' || aktion === 'routine_beenden') {
      const grund = aktion === 'routine_beenden' ? 'routine_beendet' : body.grund;
      if (!GRUENDE.includes(grund)) return Response.json({ error: 'Grund fehlt' }, { status: 400 });
      for (const t of tickets) {
        if (t.archiviert) { abgelehnt.push({ id: t.id, titel: t.title, grund: 'bereits archiviert' }); continue; }
        if (pruefById[t.id]?.timer_laeuft) { abgelehnt.push({ id: t.id, titel: t.title, grund: 'Timer läuft – bitte zuerst stoppen' }); continue; }
        if (aktion === 'routine_beenden' && (!t.rhythmus || t.status === 'erledigt')) {
          abgelehnt.push({ id: t.id, titel: t.title, grund: 'keine offene Routine' });
          continue;
        }
        await db.Ticket.update(t.id, {
          archiviert: true,
          archiviert_am: jetzt,
          archiviert_von: user.email,
          archiv_grund: grund,
          archiv_status_vorher: t.status || 'offen',
        });
        const vorschlaege = await db.Zeitvorschlag.filter({ ticket_id: t.id, status: 'offen' }, null, 100).catch(() => []);
        await Promise.all(vorschlaege.map((v) => db.Zeitvorschlag.delete(v.id)));
        const signale = await db.IntelligenceSignal.filter({ ticket_id: t.id, resolved: false }, null, 100).catch(() => []);
        await Promise.all(signale.map((s) => db.IntelligenceSignal.update(s.id, { resolved: true, resolved_at: jetzt })));
        await systemEintrag(db, t, aktion === 'routine_beenden'
          ? `Routine beendet von ${name} — es wird kein weiterer Durchlauf erzeugt.`
          : `Archiviert von ${name} (${GRUND_LABEL[grund]}).`);
        erledigt.push(t.id);
      }
      await suchindexAktiv(db, erledigt, false);
    }

    if (aktion === 'wiederherstellen') {
      for (const t of tickets) {
        if (!t.archiviert) { abgelehnt.push({ id: t.id, titel: t.title, grund: 'nicht archiviert' }); continue; }
        await db.Ticket.update(t.id, {
          archiviert: false,
          status: t.archiv_status_vorher || 'offen',
          last_status_change: jetzt,
          archiviert_am: null,
          archiviert_von: null,
          archiv_grund: null,
          archiv_status_vorher: null,
        });
        await systemEintrag(db, t, `Wiederhergestellt von ${name}.`);
        erledigt.push(t.id);
      }
      await suchindexAktiv(db, erledigt, true);
    }

    if (aktion === 'loeschen') {
      for (const t of tickets) {
        const p = pruefById[t.id];
        if (!p?.loeschbar) {
          abgelehnt.push({ id: t.id, titel: t.title, grund: `${p?.grund_nicht_loeschbar || 'nicht löschbar'} – bitte archivieren` });
          continue;
        }
        // Vollständiger Abzug vor dem Löschen — so bleibt das Ticket rekonstruierbar
        await db.AuditLog.create({
          action: 'delete',
          entity_type: 'Ticket',
          entity_id: t.id,
          user_email: user.email,
          details: `Ticket gelöscht über ticketBereinigen (Projekt ${projektById[t.project_id]?.title || t.project_id})`,
          old_value: JSON.stringify(t),
        });
        const [kommentare, vorschlaege, signale, inbox, eskalationen, index] = await Promise.all([
          db.Comment.filter({ ticket_id: t.id }, null, 200).catch(() => []),
          db.Zeitvorschlag.filter({ ticket_id: t.id }, null, 200).catch(() => []),
          db.IntelligenceSignal.filter({ ticket_id: t.id }, null, 200).catch(() => []),
          db.CrmInboxItem.filter({ linked_ticket_id: t.id }, null, 50).catch(() => []),
          db.CrmEscalation.filter({ linked_ticket_id: t.id }, null, 50).catch(() => []),
          db.SearchIndexEntry.filter({ ref_entity: 'Ticket', ref_id: t.id }, null, 10).catch(() => []),
        ]);
        await Promise.all([
          ...kommentare.map((c) => db.Comment.delete(c.id)),
          ...vorschlaege.filter((v) => v.status === 'offen').map((v) => db.Zeitvorschlag.delete(v.id)),
          ...signale.map((s) => db.IntelligenceSignal.delete(s.id)),
          ...inbox.map((i) => db.CrmInboxItem.update(i.id, { linked_ticket_id: null })),
          ...eskalationen.map((e) => db.CrmEscalation.update(e.id, { linked_ticket_id: null })),
          ...index.map((z) => db.SearchIndexEntry.update(z.id, { is_active: false })),
        ]);
        await db.Ticket.delete(t.id);
        erledigt.push(t.id);
      }
    }

    return Response.json({ erledigt, abgelehnt });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
