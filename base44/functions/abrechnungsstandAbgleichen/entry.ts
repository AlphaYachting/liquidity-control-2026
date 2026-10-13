import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import {
  sevdeskGet, fetchPaidAmount, findMatchingOrder, shouldSkipMatching, buildRecord,
  mitAnweisungVerknuepfen, extractSevdeskIdFromNotes, parseAmount,
} from '../../shared/sevdeskRechnung.js';
import { statusAusSevdesk, anweisungAngleichen, alleSeiten } from '../../shared/billingFollow.js';
import { zahlstandNachziehen } from '../../shared/sevdeskZahlstand.js';

// Live-Abgleich einzelner Abrechnungsanweisungen mit sevDesk — für den Moment, in dem
// jemand aus sevDesk zurückkommt und die App sofort den richtigen Stand zeigen soll.
// Je Anweisung: Beleg holen, Rechnungsdatensatz anlegen oder aktualisieren (exakt wie
// der 6-Stunden-Lauf, gleiche Bausteine), Status der Anweisung und der verknüpften
// Verrechnungsplanung nachziehen. Beträge werden nie geändert, Verknüpfungen nie gelöst.
//
// Body:
//   ids?: string[]       — diese Anweisungen (höchstens 25); ohne ids: alle offenen mit sevDesk-Beleg
//   nur_pruefen?: true   — schreibt nichts, meldet nur, was sich ändern würde
//   zahlstand?: true     — zusätzlich Zahlstand offener Rechnungen (nur Admin)

const ERLAUBTE_JAHRE = [2025, 2026]; // wie der 6-Stunden-Lauf (YEAR GUARD)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Offen heißt: beim Backoffice mit sevDesk-Beleg, oder als verrechnet geführt,
// aber noch ohne Rechnungsdatensatz in der App.
const istOffen = (b) => b.sevdesk_invoice_id
  && (b.status === 'sent_to_backoffice' || (b.status === 'invoice_created' && !b.linked_invoice_id));

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ error: 'SEVDESK_API_KEY nicht gesetzt' }, { status: 500 });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const nurPruefen = body.nur_pruefen === true;
    const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean).map(String).slice(0, 25) : null;
    const db = base44.asServiceRole.entities;

    const anweisungen = ids
      ? (ids.length ? await db.BillingInstruction.filter({ id: { $in: ids } }, '-created_date', 50) : [])
      : await alleSeiten((l, s) => db.BillingInstruction.filter(
        { sevdesk_invoice_id: { $nin: [null, ''] }, status: { $in: ['sent_to_backoffice', 'invoice_created'] } },
        '-created_date', l, s,
      ));
    const kandidaten = anweisungen.filter(istOffen);

    // Gleiche Nachschlagewerke wie der 6-Stunden-Lauf, damit das Ergebnis identisch ist.
    const allOrders = kandidaten.length ? await db.ConfirmedOrder.list() : [];
    const ordersById = Object.fromEntries(allOrders.map((o) => [o.id, o]));
    const ordersBySevdeskId = {};
    for (const o of allOrders) {
      const sid = extractSevdeskIdFromNotes(o.notes);
      if (sid) ordersBySevdeskId[sid] = o;
      if (o.sevdesk_order_id) ordersBySevdeskId[String(o.sevdesk_order_id)] = o;
    }

    const ergebnis = [];
    let geaendert = 0;

    for (const b of kandidaten) {
      const sid = String(b.sevdesk_invoice_id);
      let inv = null;
      try {
        const d = await sevdeskGet(`/Invoice/${sid}?embed=contact,payments`, apiKey);
        inv = Array.isArray(d.objects) ? d.objects[0] : d.objects || null;
      } catch (_e) {
        inv = null;
      }
      await sleep(200);

      // Fehlender Beleg (z. B. gelöschter Entwurf): hier nichts anfassen — das regelt
      // der Morgenlauf mit seiner bestehenden Regel.
      if (!inv) { ergebnis.push({ id: b.id, kunde: b.customer_name || '', art: 'beleg_nicht_abrufbar' }); continue; }
      const jahrOk = ERLAUBTE_JAHRE.some((y) => String(inv.invoiceDate || '').startsWith(String(y)));
      const istKorrektur = inv.origin?.objectName === 'Invoice' && parseAmount(inv.sumNet) < 0;
      if (!jahrOk || istKorrektur) { ergebnis.push({ id: b.id, kunde: b.customer_name || '', art: 'dem_6h_lauf_ueberlassen' }); continue; }

      const existing = (await db.InvoiceRecord.filter({ sevdesk_id: sid }, '-updated_date', 5))[0] || null;
      const matchResult = shouldSkipMatching(inv) ? null : findMatchingOrder(inv, allOrders, ordersBySevdeskId);
      const effectiveMatch = existing?.match_status === 'manually_matched' ? null : matchResult;
      const record = buildRecord(inv, effectiveMatch, existing, {}, {}, ordersById);
      mitAnweisungVerknuepfen(record, b, existing);
      if (record.payment_status === 'partially_paid') {
        const { paid, open } = await fetchPaidAmount(sid, record.gross_amount, apiKey);
        record.paid_amount = paid;
        record.open_amount = open;
      }

      const soll = statusAusSevdesk(inv.status);
      const eintrag: Record<string, unknown> = {
        id: b.id, kunde: b.customer_name || '', rechnung: inv.invoiceNumber || '',
        sevdesk_status: String(inv.status || ''), status_vorher: b.status, status_nachher: soll,
        rechnungsdatensatz: existing ? 'aktualisieren' : 'anlegen',
      };

      if (!nurPruefen) {
        let recordId;
        if (existing) {
          await db.InvoiceRecord.update(existing.id, record);
          recordId = existing.id;
        } else {
          recordId = (await db.InvoiceRecord.create(record)).id;
        }
        if (!b.linked_invoice_id && recordId) {
          await db.BillingInstruction.update(b.id, { linked_invoice_id: recordId });
        }
        eintrag.status_geaendert = await anweisungAngleichen(db, b, soll);
        if (eintrag.status_geaendert) geaendert++;
      }
      ergebnis.push(eintrag);
    }

    if (!nurPruefen && geaendert > 0) {
      await db.AuditLog.create({
        action: 'update',
        entity_type: 'BillingInstruction',
        entity_id: 'sevdesk_live_abgleich',
        user_email: user.email || 'system',
        details: `sevDesk-Live-Abgleich: ${kandidaten.length} geprüft, ${geaendert} nachgezogen (${ergebnis.filter((e) => e.status_geaendert).map((e) => `${e.kunde} ${e.status_vorher}→${e.status_nachher}`).join(', ')})`.slice(0, 1900),
      }).catch(() => {});
    }

    let zahlstand = null;
    if (body.zahlstand === true) {
      if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
      zahlstand = await zahlstandNachziehen({ db, apiKey, nurPruefen });
    }

    // Prüflauf: Ergebnis ins Protokoll, damit es auch aus einem Workflow heraus lesbar ist
    if (nurPruefen) {
      console.log(JSON.stringify({ geprueft: kandidaten.length, ergebnis, zahlstand }));
    }

    return Response.json({
      ok: true,
      modus: nurPruefen ? 'nur_pruefen' : 'angewendet',
      geprueft: kandidaten.length,
      geaendert,
      ergebnis,
      zahlstand,
      geprueft_am: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
