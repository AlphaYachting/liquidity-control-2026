import { resolveAssignee } from '@/lib/sprint/assignment';

export const OPEN = '__offen';

// Leitet aus den gewählten Modulen (inkl. Zusatzbausteine) die Ticketliste des Sprints ab.
export function buildTicketPlan({ selected = [], ticketTemplates = [], addOnTicketTemplates = [] }) {
  const plan = [];
  selected.forEach((sel, milestoneIndex) => {
    ticketTemplates
      .filter((t) => t.module_template_id === sel.module_template_id)
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
      .forEach((t, idx) => {
        plan.push({
          key: `${sel.key}-m-${t.id}`,
          milestoneIndex,
          milestoneName: sel.name,
          order: idx + 1,
          title: t.title,
          role: t.role || '',
          milestone_state: t.milestone_state || 'produktion',
          blocks_others: t.blocks_others || false,
          target_hours: t.target_hours || 0,
          origin: 'pflicht',
        });
      });

    sel.addon_ids.forEach((addonId) => {
      addOnTicketTemplates
        .filter((t) => t.add_on_block_id === addonId)
        .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
        .forEach((t) => {
          plan.push({
            key: `${sel.key}-a-${t.id}`,
            milestoneIndex,
            milestoneName: sel.name,
            order: plan.filter((p) => p.milestoneIndex === milestoneIndex).length + 1,
            title: t.title,
            role: t.role || '',
            milestone_state: t.milestone_state || 'produktion',
            blocks_others: t.blocks_others || false,
            target_hours: t.target_hours || 0,
            origin: 'addon',
          });
        });
    });
  });
  return plan;
}

// Rollen-Default: bewusste Wahl schlägt die Vorbelegung aus resolveAssignee
export const roleValue = (role, roleAssign = {}, members = []) =>
  roleAssign[role] !== undefined ? roleAssign[role] : resolveAssignee(role, members);

// Ticket-Override schlägt den Rollen-Default
export const ticketValue = (ticket, roleAssign = {}, overrides = {}, members = []) =>
  overrides[ticket.key] !== undefined ? overrides[ticket.key] : roleValue(ticket.role, roleAssign, members);

// Arbeitsschritte ohne Person und ohne bewusstes "offen lassen"
export function unresolvedTickets(plan = [], roleAssign = {}, overrides = {}, members = []) {
  return plan.filter((t) => !ticketValue(t, roleAssign, overrides, members));
}

// Rollen des Sprints in stabiler Reihenfolge
export function planRoles(plan = []) {
  return [...new Set(plan.map((t) => t.role).filter(Boolean))];
}