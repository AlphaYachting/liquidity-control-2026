import { base44 } from '@/api/base44Client';

// Schließt die Beauftragung ab, sobald der Wizard das Projekt angelegt hat:
// Auftrag, Anzahlungs-Instruktion (nur bei AB-Pflicht) und Kundenakt hängen am
// Projekt-Cockpit (Finanzsicht), Log am Deal.
export async function finishHandoff(handoff, project, cockpit) {
  if (!handoff?.confirmed_order_id || !project?.id) return;
  const finanzId = cockpit?.id || project.id;

  await base44.entities.ConfirmedOrder.update(handoff.confirmed_order_id, { project_id: finanzId });

  if (cockpit) {
    const order = await base44.entities.ConfirmedOrder.get(handoff.confirmed_order_id).catch(() => null);
    const patch = {};
    if (!cockpit.order_number && order?.order_number) patch.order_number = order.order_number;
    if (!Number(cockpit.total_net_amount) && Number(order?.total_net_amount)) {
      patch.total_net_amount = Number(order.total_net_amount);
      patch.open_amount = Number(order.total_net_amount) - (Number(cockpit.already_invoiced_amount) || 0);
    }
    if (Object.keys(patch).length) await base44.entities.LiquidityProject.update(cockpit.id, patch);
  }

  if (handoff.ab_required) {
    const net = Math.round((Number(handoff.advance_percent) || 0) / 100 * (Number(handoff.total_net) || 0));
    await base44.entities.BillingInstruction.create({
      project_id: finanzId,
      confirmed_order_id: handoff.confirmed_order_id,
      customer_name: handoff.customer || '',
      project_name: handoff.project_name || project.title || '',
      invoice_type: 'advance_invoice',
      instruction_type: 'percentage_based',
      status: 'ready_for_backoffice',
      total_order_net: Number(handoff.total_net) || 0,
      new_billing_percent: Number(handoff.advance_percent) || 0,
      instruction_amount_net: net,
      requested_by_pm: handoff.pm || '',
      invoice_reason: `Anzahlung ${handoff.advance_percent} % laut Auftragsbestätigung`,
    });
  }

  // Kommunikation aus dem Deal wandert als erster Eintrag in den Kundenakt
  if (handoff.context_text) {
    await base44.entities.ProjectFileEntry.create({
      project_id: finanzId,
      entry_type: 'update',
      title: 'Kontext aus der Anfrage',
      content: handoff.context_text,
      entry_date: new Date().toISOString(),
    });
  }

  if (handoff.deal_id) {
    await base44.entities.CrmActivity.create({
      deal_id: handoff.deal_id,
      activity_type: 'system',
      title: 'Beauftragt: Auftrag + Projekt angelegt',
      content: handoff.ab_required
        ? `Projekt „${project.title}" angelegt, Anzahlungs-Instruktion über ${handoff.advance_percent} % erstellt.`
        : `Projekt „${project.title}" angelegt, keine Auftragsbestätigung nötig.`,
      activity_date: new Date().toISOString(),
    });
  }
}