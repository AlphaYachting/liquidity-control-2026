import { base44 } from '@/api/base44Client';

// Schließt die Beauftragung ab, sobald der Wizard das Projekt angelegt hat:
// project_id am Auftrag, Anzahlungs-Instruktion (nur bei AB-Pflicht), Log am Deal.
export async function finishHandoff(handoff, project) {
  if (!handoff?.confirmed_order_id || !project?.id) return;

  await base44.entities.ConfirmedOrder.update(handoff.confirmed_order_id, { project_id: project.id });

  if (handoff.ab_required) {
    const net = Math.round((Number(handoff.advance_percent) || 0) / 100 * (Number(handoff.total_net) || 0));
    await base44.entities.BillingInstruction.create({
      project_id: project.id,
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