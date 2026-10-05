import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

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

    const { aktion, billing_instruction_id } = await req.json();
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
      if (snap.quelle !== 'app') return Response.json({ error: 'Keine App-Support-Abrechnung' }, { status: 400 });
      if (!instr.sevdesk_invoice_id) return Response.json({ error: 'Kein sevDesk-Entwurf — es wird nichts markiert' }, { status: 400 });
      const jetzt = new Date().toISOString();
      let markiert = 0;
      await inStuecken(entryIds, async (id) => {
        const e = (await sr.entities.TimeEntry.filter({ id }))[0];
        if (!e || (e.abrechnungsstatus || 'offen') !== 'offen') return;
        await sr.entities.TimeEntry.update(id, { abrechnungsstatus: 'abgerechnet', billing_instruction_id: instr.id, abgerechnet_am: jetzt });
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
      let geoeffnet = 0;
      await inStuecken(entryIds, async (id) => {
        const e = (await sr.entities.TimeEntry.filter({ id }))[0];
        if (!e || e.billing_instruction_id !== instr.id) return;
        await sr.entities.TimeEntry.update(id, { abrechnungsstatus: 'offen', billing_instruction_id: null, abgerechnet_am: null });
        geoeffnet++;
      });
      await inStuecken(vorleistungIds, (id) => sr.entities.Ticket.update(id, { awork_vorleistung_abgerechnet: false }));
      await inStuecken(ticketIds, async (id) => {
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