import { base44 } from '@/api/base44Client';

const MODELL = { sprint: 'pauschal', container: 'retainer', support: 'aufwand', regie: 'aufwand' };

// Finanz-ID eines Projekts: das verknüpfte Cockpit, ersatzweise die Projekt-ID.
export const finanzIdVon = (project) => project?.liquidity_project_id || project?.id;

// Jedes Projekt hat genau ein Projekt-Cockpit. Verknüpft immer in beide Richtungen.
export async function cockpitSicherstellen({ project, clientName, typ, pmEmail, order, bestehendesCockpitId }) {
  let cockpit = null;

  if (bestehendesCockpitId) {
    cockpit = await base44.entities.LiquidityProject.get(bestehendesCockpitId);
  } else if (project.liquidity_project_id) {
    cockpit = await base44.entities.LiquidityProject.get(project.liquidity_project_id).catch(() => null);
  }

  if (!cockpit) {
    const pm = pmEmail
      ? (await base44.entities.TeamMember.filter({ email: pmEmail }, 'name', 1))[0]
      : null;
    const wert = Number(order?.total_net_amount) || 0;
    cockpit = await base44.entities.LiquidityProject.create({
      customer: clientName || '',
      project_name: project.title,
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
    });
  }

  if (cockpit.project_ref_id && cockpit.project_ref_id !== project.id) {
    throw new Error(`Das Projekt-Cockpit „${cockpit.project_name}" ist bereits mit einem anderen Projekt verknüpft.`);
  }
  if (cockpit.project_ref_id !== project.id) {
    await base44.entities.LiquidityProject.update(cockpit.id, { project_ref_id: project.id });
  }
  if (project.liquidity_project_id !== cockpit.id) {
    await base44.entities.Project.update(project.id, { liquidity_project_id: cockpit.id });
  }
  return { ...cockpit, project_ref_id: project.id };
}