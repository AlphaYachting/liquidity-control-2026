import { base44 } from '@/api/base44Client';

const MODELL = { sprint: 'pauschal', container: 'retainer', support: 'aufwand', regie: 'aufwand' };

// Finanz-ID eines Projekts: das verknüpfte Cockpit, ersatzweise die Projekt-ID.
export const finanzIdVon = (project) => project?.liquidity_project_id || project?.id;

// Jedes Projekt hat genau ein Projekt-Cockpit. Verknüpft immer in beide Richtungen.
export async function cockpitSicherstellen({ project, clientName, typ, pmEmail, order, bestehendesCockpitId }) {
  let cockpit = null;

  if (bestehendesCockpitId) {
    cockpit = await base44.entities.LiquidityProject.get(bestehendesCockpitId).catch(() => null);
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

  // Belegt ist ein Cockpit in beide Richtungen: über project_ref_id oder weil ein
  // anderes Projekt über liquidity_project_id darauf zeigt.
  const fremde = (await base44.entities.Project.filter({ liquidity_project_id: cockpit.id }))
    .filter((p) => p.id !== project.id);
  if ((cockpit.project_ref_id && cockpit.project_ref_id !== project.id) || fremde.length > 0) {
    throw new Error(`Das Projekt-Cockpit „${cockpit.project_name}" ist bereits mit einem anderen Projekt verknüpft.`);
  }

  // Umhängen: bisheriges Cockpit freigeben, damit es nicht verwaist zurückbleibt.
  if (project.liquidity_project_id && project.liquidity_project_id !== cockpit.id) {
    const alt = await base44.entities.LiquidityProject.get(project.liquidity_project_id).catch(() => null);
    if (alt && alt.project_ref_id === project.id) {
      await base44.entities.LiquidityProject.update(alt.id, { project_ref_id: null });
    }
  }

  if (cockpit.project_ref_id !== project.id) {
    await base44.entities.LiquidityProject.update(cockpit.id, { project_ref_id: project.id });
  }
  if (project.liquidity_project_id !== cockpit.id) {
    await base44.entities.Project.update(project.id, { liquidity_project_id: cockpit.id });
  }
  return { ...cockpit, project_ref_id: project.id };
}

// Trennt Projekt und Cockpit beidseitig. Beide Datensätze bleiben erhalten.
export async function cockpitLoesen({ project }) {
  if (!project?.id) return;
  if (project.liquidity_project_id) {
    const cockpit = await base44.entities.LiquidityProject.get(project.liquidity_project_id).catch(() => null);
    if (cockpit && cockpit.project_ref_id === project.id) {
      await base44.entities.LiquidityProject.update(cockpit.id, { project_ref_id: null });
    }
  }
  await base44.entities.Project.update(project.id, { liquidity_project_id: null });
}