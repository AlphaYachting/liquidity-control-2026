import { base44 } from '@/api/base44Client';
import { matchModules, suggestModuleId } from '@/lib/crm/handoverCommit';

// Findet das Projekt zu einem Auftrag: project_id ist die Cockpit-ID,
// bei Altfällen direkt eine Project-ID.
export async function projektZumAuftrag(order) {
  if (!order?.project_id) return null;
  const cockpit = await base44.entities.LiquidityProject.get(order.project_id).catch(() => null);
  if (cockpit) return cockpit.project_ref_id || null;
  const projekt = await base44.entities.Project.get(order.project_id).catch(() => null);
  return projekt?.id || null;
}

// Startkeim für den Anlage-Wizard aus einem bestehenden Auftrag — ohne neuen Auftrag, ohne sevDesk-Beleg
export async function wizardAusAuftrag(order, deal) {
  const [items, modules, anzahlungen, clients] = await Promise.all([
    base44.entities.ConfirmedOrderItem.filter({ confirmed_order_id: order.id }, 'position', 200),
    base44.entities.ModuleTemplate.list('-created_date', 200),
    base44.entities.BillingInstruction.filter({ confirmed_order_id: order.id, invoice_type: 'advance_invoice' }, '-created_date', 1),
    order.sevdesk_contact_id
      ? base44.entities.Client.filter({ sevdesk_contact_id: order.sevdesk_contact_id }, '-created_date', 1)
      : base44.entities.Client.filter({ name: order.customer }, '-created_date', 1),
  ]);
  const typ = (order.notes || '').match(/Projekttyp:\s*(\w+)/)?.[1] || 'sprint';
  const positions = items.map((it) => ({ name: it.title, amount: it.total_price, module_template_id: suggestModuleId(it.title, modules) }));
  return {
    seed: { client_id: clients[0]?.id || '', type: typ, pm_email: order.responsible_project_manager || '', title: order.project_name },
    sprint: { selected: matchModules(positions, modules) },
    handoff: {
      confirmed_order_id: order.id,
      deal_id: deal.id,
      customer: order.customer,
      project_name: order.project_name,
      total_net: Number(order.total_net_amount) || 0,
      advance_percent: Number(order.advance_percent) || 0,
      // Anzahlungs-Anweisung nur, wenn es noch keine gibt
      ab_required: anzahlungen.length === 0 && Number(order.advance_percent) > 0,
      pm: order.responsible_project_manager || '',
      context_text: '',
      email_thread_id: deal.email_thread_id || '',
    },
  };
}