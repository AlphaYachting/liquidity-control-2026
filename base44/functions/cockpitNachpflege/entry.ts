import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Einmalige Nachpflege: aktive Projekte ohne Projekt-Cockpit bekommen eines,
// Finanzdaten mit project_id = Project.id werden auf die Cockpit-ID umgehängt.
// modus "pruefen" (Standard) zeigt nur die Vorschau, "anwenden" schreibt. Nichts wird gelöscht.

const MODELL: Record<string, string> = { sprint: 'pauschal', legacy: 'pauschal', container: 'retainer', support: 'aufwand', regie: 'aufwand' };
const ABHAENGIG = ['ConfirmedOrder', 'BillingInstruction', 'InvoiceRecord', 'MonthlyBillingPlan', 'ProjectFileEntry'];

function typVon(p: any) {
  if (p.is_legacy) return 'legacy';
  if (p.abrechnungsmodell === 'intern') return 'intern';
  if (p.abrechnungsmodell === 'paket') return 'container';
  if (p.abrechnungsmodell === 'sprint') return 'sprint';
  return p.aufwand_art === 'regie' ? 'regie' : 'support';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Nur für Admins' }, { status: 403 });
    const { modus = 'pruefen' } = await req.json().catch(() => ({}));
    const anwenden = modus === 'anwenden';
    const db = base44.asServiceRole.entities;

    const projekte = (await db.Project.filter({ status: 'aktiv' }, '-created_date', 500))
      .filter((p: any) => typVon(p) !== 'intern' && !p.liquidity_project_id);

    const ergebnis = [];
    for (const p of projekte) {
      const typ = typVon(p);
      const client = p.client_id ? await db.Client.get(p.client_id).catch(() => null) : null;
      const pm = p.pm_email ? (await db.TeamMember.filter({ email: p.pm_email }, 'name', 1))[0] : null;
      const umhaengen: Record<string, string[]> = {};
      for (const e of ABHAENGIG) {
        umhaengen[e] = (await db[e].filter({ project_id: p.id }, '-created_date', 500)).map((r: any) => r.id);
      }
      const order = umhaengen.ConfirmedOrder.length ? await db.ConfirmedOrder.get(umhaengen.ConfirmedOrder[0]) : null;
      const wert = Number(order?.total_net_amount) || 0;
      const cockpitDaten = {
        customer: client?.name || '',
        project_name: p.title,
        order_number: order?.order_number || '',
        total_net_amount: wert,
        open_amount: wert,
        already_invoiced_amount: 0,
        project_manager: pm?.name || '',
        status: 'active',
        abrechnungsmodell: MODELL[typ] || 'unbekannt',
        billing_relevance_status: 'active_billing_relevant',
        is_active_for_billing: true,
        excluded_from_project_cockpit: false,
        excluded_from_forecast: false,
        source_sheet: 'Projekt-Wizard',
        project_ref_id: p.id,
      };

      let cockpitId = null;
      if (anwenden) {
        const cockpit = await db.LiquidityProject.create(cockpitDaten);
        cockpitId = cockpit.id;
        await db.Project.update(p.id, { liquidity_project_id: cockpitId });
        for (const e of ABHAENGIG) {
          for (const id of umhaengen[e]) await db[e].update(id, { project_id: cockpitId });
        }
      }
      ergebnis.push({
        project_id: p.id, titel: p.title, kunde: cockpitDaten.customer, typ,
        auftragswert: wert, abrechnungsmodell: cockpitDaten.abrechnungsmodell,
        project_manager: cockpitDaten.project_manager, umhaengen, neues_cockpit_id: cockpitId,
      });
    }
    return Response.json({ modus, anzahl: ergebnis.length, projekte: ergebnis });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});