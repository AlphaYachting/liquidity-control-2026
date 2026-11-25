import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';

// Status der Rechnung in sevDesk: '100' = Entwurf. null = Rechnung in sevDesk nicht (mehr) vorhanden.
async function sevdeskStatus(invoiceId) {
  const apiKey = secrets.get('SEVDESK_API_KEY');
  if (!apiKey) throw new Error('sevDesk ist nicht verbunden — Status der Rechnung nicht prüfbar');
  const res = await fetch(`${SEVDESK_BASE}/Invoice/${invoiceId}`, { headers: { Authorization: apiKey, 'Content-Type': 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`sevDesk nicht erreichbar (${res.status}) — bitte später noch einmal`);
  const inv = ((await res.json()).objects || [])[0];
  return inv ? String(inv.status || '') : null;
}

// Support-Abrechnung: enthaltene Zeitbuchungen und aWork-Vorleistungen als abgerechnet markieren
// bzw. beim Zurücknehmen wieder öffnen. Läuft mit Service-Rolle, weil TimeEntry-RLS
// Änderungen sonst nur dem Buchenden oder Admins erlaubt.
// Eingabe: { aktion: 'markieren' | 'zuruecknehmen', billing_instruction_id }

async function inStuecken(liste, fn) {
  for (let i = 0; i < liste.length; i += 10) await Promise.all(liste.slice(i, i + 10).map(fn));
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // nur_ohne_rechnung: Aufräumen nach gescheitertem sevDesk-Entwurf — nur verwerfen, wenn wirklich kein Entwurf existiert
    const { aktion, billing_instruction_id, nur_ohne_rechnung } = await req.json();
    const sr = base44.asServiceRole;
    const instr = (await sr.entities.BillingInstruction.filter({ id: billing_instruction_id }))[0];
    if (!instr) return Response.json({ error: 'Abrechnungsanweisung nicht gefunden' }, { status: 404 });

    let snap = {};
    try { snap = instr.source_snapshot_json ? JSON.parse(instr.source_snapshot_json) : {}; } catch (_e) { snap = {}; }
    const entryIds = snap.time_entry_ids || [];
    const vorleistungIds = snap.vorleistung_ticket_ids || [];
    const ticketIds = snap.support_ticket_ids || [];
    const textByTicket = Object.fromEntries((snap.invoice_positions || []).filter(p => p.ticket_id).map(p => [p.ticket_id, p.leistung || p.text || '']));

    if (aktion === 'markieren') {
      // 'app' = Support-Tickets, 'regie' = Regie nach Aufwand (markiert nur Zeitbuchungen, keine Tickets),
      // 'kunde' = Kundenblock aus beidem (22.10.2026): support_ticket_ids enthält nur die Support-Tickets,
      // Regie-Aufgaben bleiben offen — dieselbe Logik wie 'app'.
      if (!['app', 'regie', 'kunde'].includes(snap.quelle)) return Response.json({ error: 'Keine App-Support- oder Regie-Abrechnung' }, { status: 400 });
      if (!instr.sevdesk_invoice_id) return Response.json({ error: 'Kein sevDesk-Entwurf — es wird nichts markiert' }, { status: 400 });
      const jetzt = new Date().toISOString();
      let markiert = 0;
      await inStuecken(entryIds, async (id) => {
        const e = (await sr.entities.TimeEntry.filter({ id }))[0];
        if (!e || (e.abrechnungsstatus || 'offen') !== 'offen') return;
        // Ohne Ticket gebuchte Zeit, die in der Abrechnung einem Ticket zugeordnet wurde, bekommt die Ticketzuordnung dauerhaft
        const ticketNeu = !e.ticket_id && snap.zuordnung?.[id] ? { ticket_id: snap.zuordnung[id] } : {};
        await sr.entities.TimeEntry.update(id, { abrechnungsstatus: 'abgerechnet', billing_instruction_id: instr.id, abgerechnet_am: jetzt, ...ticketNeu });
        markiert++;
      });
      await inStuecken(vorleistungIds, (id) => sr.entities.Ticket.update(id, { awork_vorleistung_abgerechnet: true }));
      // Tickets als verrechnet kennzeichnen — samt Leistungstext, der auf der Rechnung stand
      await inStuecken(ticketIds, (id) => sr.entities.Ticket.update(id, {
        verrechnung_status: 'verrechnet', verrechnung_text: textByTicket[id] || '',
        verrechnung_von: user.email, verrechnung_am: jetzt, verrechnung_grund: null, verrechnung_notiz: null,
      }));
      return Response.json({ success: true, markiert, vorleistungen: vorleistungIds.length, tickets: ticketIds.length });
    }

    if (aktion === 'zuruecknehmen') {
      if (user.role !== 'admin' && instr.created_by_id !== user.id) {
        return Response.json({ error: 'Nur wer die Abrechnung angelegt hat oder ein Admin darf sie zurücknehmen' }, { status: 403 });
      }
      // Ohne sevDesk-Rechnung wurde nie etwas markiert (markieren verlangt den Entwurf) —
      // die Anweisung wird nur verworfen. Tickets und Vorleistungen gehören dann womöglich
      // schon einer späteren, erfolgreichen Abrechnung und dürfen NICHT zurückgesetzt werden (25.11.2026).
      if (nur_ohne_rechnung && instr.sevdesk_invoice_id) {
        return Response.json({ error: 'In sevDesk wurde doch ein Entwurf angelegt — die Anweisung bleibt bestehen. Bitte „Neu prüfen“.' }, { status: 409 });
      }
      if (!instr.sevdesk_invoice_id) {
        await sr.entities.BillingInstruction.delete(instr.id);
        return Response.json({ success: true, geoeffnet: 0, verworfen: true });
      }
      // Zurücknehmen nur, solange die Rechnung in sevDesk Entwurf ist — eine versendete Rechnung
      // bleibt beim Kunden, die Stunden würden sonst doppelt verrechnet (25.11.2026).
      const status = await sevdeskStatus(instr.sevdesk_invoice_id);
      if (status !== null && status !== '100') {
        return Response.json({ error: 'Die Rechnung ist in sevDesk nicht mehr Entwurf — bitte dort stornieren. Zurücknehmen ist nur bei Entwürfen möglich.' }, { status: 409 });
      }
      // Tickets und Vorleistungen nur zurücksetzen, wenn keine andere Abrechnung mit sevDesk-Rechnung sie enthält
      const andere = (await sr.entities.BillingInstruction.list('-created_date', 2000))
        .filter((a) => a.id !== instr.id && a.status !== 'cancelled' && a.sevdesk_invoice_id);
      const belegtTickets = new Set();
      const belegtVorleistung = new Set();
      for (const a of andere) {
        let s = null;
        try { s = a.source_snapshot_json ? JSON.parse(a.source_snapshot_json) : null; } catch (_e) { s = null; }
        (s?.support_ticket_ids || []).forEach((id) => belegtTickets.add(id));
        (s?.vorleistung_ticket_ids || []).forEach((id) => belegtVorleistung.add(id));
      }
      let geoeffnet = 0;
      await inStuecken(entryIds, async (id) => {
        const e = (await sr.entities.TimeEntry.filter({ id }))[0];
        if (!e || e.billing_instruction_id !== instr.id) return;
        await sr.entities.TimeEntry.update(id, { abrechnungsstatus: 'offen', billing_instruction_id: null, abgerechnet_am: null });
        geoeffnet++;
      });
      await inStuecken(vorleistungIds.filter((id) => !belegtVorleistung.has(id)), (id) => sr.entities.Ticket.update(id, { awork_vorleistung_abgerechnet: false }));
      await inStuecken(ticketIds.filter((id) => !belegtTickets.has(id)), async (id) => {
        const t = (await sr.entities.Ticket.filter({ id }))[0];
        if (!t || t.verrechnung_status !== 'verrechnet') return;
        await sr.entities.Ticket.update(id, { verrechnung_status: 'offen', verrechnung_text: null, verrechnung_von: null, verrechnung_am: null });
      });
      await sr.entities.BillingInstruction.delete(instr.id);
      return Response.json({ success: true, geoeffnet });
    }

    return Response.json({ error: 'Unbekannte Aktion' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}