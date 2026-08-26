import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// sevDesk-Belegstatus → Status der Abrechnungsanweisung.
// 100 = Entwurf: der Beleg ist NICHT verrechnet, die Anweisung liegt beim Backoffice.
function statusAusSevdesk(sevStatus) {
  const s = String(sevStatus || '');
  if (s === '1000') return 'paid';
  if (s === '750' || s === '300') return 'invoice_created';
  if (s === '50') return 'cancelled';
  if (s === '100') return 'sent_to_backoffice';
  return 'invoice_created';
}

const norm = (v) => (v || '').toLowerCase().replace(/\s+/g, ' ').trim();

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ error: 'SEVDESK_API_KEY nicht gesetzt' }, { status: 500 });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    // Ohne apply=true wird ausschliesslich geprüft — kein einziger Schreibvorgang.
    const apply = body.apply === true;
    const nurIds = Array.isArray(body.ids) ? body.ids : [];

    const [instructions, invoiceRecords] = await Promise.all([
      base44.asServiceRole.entities.BillingInstruction.list('-created_date', 1000),
      base44.asServiceRole.entities.InvoiceRecord.filter({ source_type: 'sevdesk' }),
    ]);

    const recordBySevdeskId = {};
    const recordById = {};
    for (const r of invoiceRecords) {
      if (r.sevdesk_id) recordBySevdeskId[String(r.sevdesk_id)] = r;
      recordById[r.id] = r;
    }
    // Belege, die schon an einer anderen Anweisung hängen, sind als Kandidat gesperrt.
    const belegtVon = {};
    for (const b of instructions) {
      if (b.sevdesk_invoice_id) belegtVon[String(b.sevdesk_invoice_id)] = b.id;
    }

    const faelle = [];
    let angewendet = 0;

    for (const b of instructions) {
      const basis = {
        id: b.id,
        kunde: b.customer_name || '',
        projekt: b.project_name || '',
        projekt_id: b.project_id,
        netto: Number(b.instruction_amount_net) || 0,
        status_app: b.status,
        sevdesk_invoice_id: b.sevdesk_invoice_id || null,
      };

      // ── Fall A: Anweisung zeigt auf einen sevDesk-Beleg → live gegenprüfen
      if (b.sevdesk_invoice_id) {
        let live = null;
        let http = 0;
        try {
          const res = await fetch(`${SEVDESK_BASE}/Invoice/${b.sevdesk_invoice_id}?embed=contact`, {
            headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
          });
          http = res.status;
          if (res.ok) {
            const d = await res.json();
            live = Array.isArray(d.objects) ? d.objects[0] : d.objects || null;
          }
        } catch (e) {
          faelle.push({ ...basis, art: 'pruefung_fehlgeschlagen', meldung: e.message });
          continue;
        }
        await sleep(250);

        if (!live) {
          // Beleg existiert in sevDesk nicht mehr (gelöschter Entwurf) — die Anweisung
          // gilt in der App trotzdem als verrechnet und verfälscht den Forecast.
          const fall = {
            ...basis, art: 'beleg_in_sevdesk_nicht_vorhanden', http,
            vorschlag: { status: 'ready_for_backoffice', sevdesk_invoice_id: null, sevdesk_invoice_url: null },
            begruendung: 'sevDesk kennt diese Rechnungs-ID nicht (Entwurf gelöscht). Verknüpfung lösen und Anweisung wieder als offen führen.',
          };
          if (apply && nurIds.includes(b.id)) {
            await base44.asServiceRole.entities.BillingInstruction.update(b.id, fall.vorschlag);
            fall.angewendet = true; angewendet++;
          }
          faelle.push(fall);
          continue;
        }

        const sevNetto = parseFloat(live.sumNet || '0') || 0;
        const sollStatus = statusAusSevdesk(live.status);
        const abweichungen = [];
        if (sollStatus !== b.status) abweichungen.push('status');
        if (Math.abs(sevNetto - basis.netto) > 1) abweichungen.push('betrag');

        const fall = {
          ...basis,
          art: abweichungen.length ? 'abweichung' : 'stimmt',
          abweichungen,
          rechnungsnummer: live.invoiceNumber || '',
          sevdesk_status: String(live.status || ''),
          sevdesk_netto: sevNetto,
          rechnungsdatum: (live.invoiceDate || '').slice(0, 10),
          vorschlag: abweichungen.includes('status') ? { status: sollStatus } : null,
        };
        // Betragsabweichungen werden NIE automatisch überschrieben — das ist eine
        // inhaltliche Entscheidung (Anweisung falsch oder Rechnung geändert).
        if (apply && nurIds.includes(b.id) && fall.vorschlag) {
          const extra = sollStatus === 'invoice_created' && !b.invoice_created_at
            ? { invoice_created_at: new Date().toISOString() } : {};
          await base44.asServiceRole.entities.BillingInstruction.update(b.id, { ...fall.vorschlag, ...extra });
          fall.angewendet = true; angewendet++;
        }
        faelle.push(fall);
        continue;
      }

      // ── Fall B: kein sevDesk-Bezug → nur eindeutige Treffer vorschlagen
      const kandidaten = invoiceRecords.filter((r) =>
        norm(r.customer_name) === norm(b.customer_name) &&
        Math.abs((Number(r.net_amount) || 0) - basis.netto) <= 1 &&
        r.payment_status !== 'cancelled' &&
        !(r.sevdesk_id && belegtVon[String(r.sevdesk_id)] && belegtVon[String(r.sevdesk_id)] !== b.id)
      ).map((r) => ({
        rechnungsnummer: r.invoice_number, sevdesk_id: r.sevdesk_id,
        rechnungsdatum: r.invoice_date, zahlstatus: r.payment_status,
        netto: r.net_amount, record_id: r.id,
      }));

      const linked = b.linked_invoice_id ? recordById[b.linked_invoice_id] : null;
      if (linked) {
        const sollStatus = linked.payment_status === 'paid' ? 'paid'
          : linked.payment_status === 'cancelled' ? 'cancelled'
          : linked.is_sent ? 'invoice_created' : 'sent_to_backoffice';
        const fall = {
          ...basis, art: sollStatus === b.status ? 'stimmt' : 'abweichung',
          abweichungen: sollStatus === b.status ? [] : ['status'],
          rechnungsnummer: linked.invoice_number || '', sevdesk_status: '',
          sevdesk_netto: Number(linked.net_amount) || 0,
          rechnungsdatum: linked.invoice_date || '',
          quelle: 'manuell erfasste Rechnung',
          vorschlag: sollStatus === b.status ? null : { status: sollStatus },
        };
        if (apply && nurIds.includes(b.id) && fall.vorschlag) {
          await base44.asServiceRole.entities.BillingInstruction.update(b.id, fall.vorschlag);
          fall.angewendet = true; angewendet++;
        }
        faelle.push(fall);
        continue;
      }

      if (kandidaten.length === 1) {
        const k = kandidaten[0];
        const sollStatus = k.zahlstatus === 'paid' ? 'paid' : 'invoice_created';
        const fall = {
          ...basis, art: 'ohne_beleg_eindeutiger_kandidat', kandidaten,
          vorschlag: {
            sevdesk_invoice_id: k.sevdesk_id ? String(k.sevdesk_id) : null,
            sevdesk_invoice_url: k.sevdesk_id ? `https://my.sevdesk.de/#/fi/${k.sevdesk_id}` : null,
            linked_invoice_id: k.record_id,
            status: sollStatus,
          },
          begruendung: `Genau eine sevDesk-Rechnung passt auf Kunde und Nettobetrag: ${k.rechnungsnummer}.`,
        };
        if (apply && nurIds.includes(b.id)) {
          await base44.asServiceRole.entities.BillingInstruction.update(b.id, fall.vorschlag);
          if (k.sevdesk_id) belegtVon[String(k.sevdesk_id)] = b.id;
          fall.angewendet = true; angewendet++;
        }
        faelle.push(fall);
        continue;
      }

      faelle.push({
        ...basis,
        art: kandidaten.length > 1 ? 'ohne_beleg_mehrere_kandidaten' : 'ohne_beleg_kein_kandidat',
        kandidaten,
        vorschlag: null,
        begruendung: kandidaten.length > 1
          ? 'Mehrere sevDesk-Rechnungen passen — die Zuordnung muss ein Mensch entscheiden.'
          : 'Keine sevDesk-Rechnung passt auf Kunde und Nettobetrag. Entweder noch nicht ausgestellt oder abweichend fakturiert.',
      });
    }

    const zusammenfassung = {
      geprueft: faelle.length,
      stimmt: faelle.filter((f) => f.art === 'stimmt').length,
      abweichung: faelle.filter((f) => f.art === 'abweichung').length,
      beleg_fehlt: faelle.filter((f) => f.art === 'beleg_in_sevdesk_nicht_vorhanden').length,
      eindeutiger_kandidat: faelle.filter((f) => f.art === 'ohne_beleg_eindeutiger_kandidat').length,
      mehrere_kandidaten: faelle.filter((f) => f.art === 'ohne_beleg_mehrere_kandidaten').length,
      kein_kandidat: faelle.filter((f) => f.art === 'ohne_beleg_kein_kandidat').length,
      pruefung_fehlgeschlagen: faelle.filter((f) => f.art === 'pruefung_fehlgeschlagen').length,
    };

    if (apply && angewendet > 0) {
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'update',
        entity_type: 'BillingInstruction',
        entity_id: 'sevdesk_abgleich',
        user_email: user.email || 'system',
        details: `sevDesk-Abgleich: ${angewendet} Anweisung(en) angeglichen (${nurIds.join(', ')})`,
      }).catch(() => {});
    }

    return Response.json({ ok: true, modus: apply ? 'angewendet' : 'nur_pruefung', angewendet, zusammenfassung, faelle });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}