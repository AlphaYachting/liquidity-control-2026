import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { pruefeAnweisungen, AUTOMATISCHE_ARTEN } from '../../shared/billingReconcile.js';
import { zahlstandNachziehen } from '../../shared/sevdeskZahlstand.js';

// Täglicher Abgleich: spiegelt den sevDesk-Stand in die Abrechnungsanweisungen.
// Angeglichen wird nur, was in sevDesk eine Tatsache ist — Statuswechsel des
// verknüpften Belegs und gelöschte Entwürfe. Zuordnungen und Betragsabweichungen
// bleiben dem Menschen vorbehalten und werden nur protokolliert.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ error: 'SEVDESK_API_KEY nicht gesetzt' }, { status: 500 });

    const { faelle, zusammenfassung, angewendet } = await pruefeAnweisungen({
      base44, apiKey, apply: true, autoArten: AUTOMATISCHE_ARTEN,
    });

    const offen = faelle.filter((f) =>
      f.art === 'ohne_beleg_eindeutiger_kandidat' ||
      f.art === 'ohne_beleg_mehrere_kandidaten' ||
      (f.abweichungen || []).includes('betrag')
    );

    await base44.asServiceRole.entities.AuditLog.create({
      action: 'update',
      entity_type: 'BillingInstruction',
      entity_id: 'sevdesk_abgleich_taeglich',
      user_email: 'system',
      details: `Täglicher sevDesk-Abgleich: ${zusammenfassung.geprueft} geprüft, ${angewendet} angeglichen, ${offen.length} brauchen eine Entscheidung.`,
    }).catch(() => {});

    // Zahlstand älterer, in der App noch offener Rechnungen nachziehen (der 6-Stunden-Lauf
    // sieht nur die 50 neuesten). Eigener Schritt: ein Fehler hier lässt den Abgleich oben stehen.
    let zahlstand = null;
    try {
      zahlstand = await zahlstandNachziehen({ db: base44.asServiceRole.entities, apiKey });
      if (zahlstand.geaendert.length || zahlstand.nicht_gefunden.length) {
        await base44.asServiceRole.entities.AuditLog.create({
          action: 'update',
          entity_type: 'InvoiceRecord',
          entity_id: 'sevdesk_zahlstand_taeglich',
          user_email: 'system',
          details: `Zahlstand nachgezogen: ${zahlstand.geprueft} offene Rechnungen geprüft, ${zahlstand.geaendert.length} geändert (${zahlstand.geaendert.map((g) => `${g.rechnung} ${g.vorher}→${g.nachher}`).join(', ')}), ${zahlstand.nicht_gefunden.length} in sevDesk nicht gefunden, ${zahlstand.vertagt} vertagt.`.slice(0, 1900),
        }).catch(() => {});
      }
    } catch (e) {
      zahlstand = { fehler: e.message };
    }

    return Response.json({
      ok: true, angewendet, zusammenfassung, zahlstand,
      offene_entscheidungen: offen.map((f) => ({
        id: f.id, kunde: f.kunde, projekt: f.projekt, netto: f.netto, art: f.art,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}