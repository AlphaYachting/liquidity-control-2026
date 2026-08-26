import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { pruefeAnweisungen, AUTOMATISCHE_ARTEN } from '../../shared/billingReconcile.js';

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

    return Response.json({
      ok: true, angewendet, zusammenfassung,
      offene_entscheidungen: offen.map((f) => ({
        id: f.id, kunde: f.kunde, projekt: f.projekt, netto: f.netto, art: f.art,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}