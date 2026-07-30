// Ticket-Verantwortliche aus dem Rollen-Mapping: eindeutig besetzte Rolle wird automatisch gesetzt.
export function resolveAssignee(role, members = []) {
  if (!role) return '';
  const candidates = members.filter((m) => m.active !== false && (m.roles || []).includes(role));
  return candidates.length === 1 ? candidates[0].email : '';
}

// Rollen, die im Team mehrfach oder nicht besetzt sind — die müssen gefragt werden
export function ambiguousRoles(roles = [], members = []) {
  return [...new Set(roles.filter(Boolean))].filter((role) => !resolveAssignee(role, members));
}