import React, { useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SectionLabel from '@/components/sprint/SectionLabel';
import { OPEN, planRoles, roleValue, ticketValue } from '@/lib/sprint/ticketPlan';

function PersonSelect({ value, candidates, members, onChange, placeholder }) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-56 bg-white"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {candidates.map((m) => <SelectItem key={m.email} value={m.email}>{m.name}</SelectItem>)}
        <SelectItem value={OPEN}>offen lassen</SelectItem>
      </SelectContent>
    </Select>
  );
}

// Zuständigkeiten: Standard pro Rolle, Feinsteuerung pro Ticket.
export default function StepZustaendigkeit({ plan, members, roleAssign, setRoleAssign, overrides, setOverrides }) {
  const [openRoles, setOpenRoles] = useState([]);
  const roles = planRoles(plan);

  const toggleRole = (role) =>
    setOpenRoles((r) => (r.includes(role) ? r.filter((x) => x !== role) : [...r, role]));

  // Rollenwahl setzt alle Tickets dieser Rolle — bestehende Ticket-Overrides fallen weg
  const chooseRole = (role, email) => {
    setRoleAssign({ ...roleAssign, [role]: email });
    const next = { ...overrides };
    plan.filter((t) => t.role === role).forEach((t) => { delete next[t.key]; });
    setOverrides(next);
  };

  return (
    <div className="space-y-4">
      <SectionLabel>Zuständigkeiten</SectionLabel>
      <p className="text-sm text-muted-foreground">
        Eine Person je Rolle genügt. Einzelne Arbeitsschritte lassen sich darunter abweichend besetzen.
      </p>

      <div className="space-y-2">
        {roles.map((role) => {
          const candidates = members.filter((m) => (m.roles || []).includes(role));
          const value = roleValue(role, roleAssign, members);
          const roleTickets = plan.filter((t) => t.role === role);
          const missing = roleTickets.some((t) => !ticketValue(t, roleAssign, overrides, members));
          const expanded = openRoles.includes(role);

          return (
            <div key={role} className={`rounded border ${missing ? 'border-status-attention bg-status-attention-surface' : 'border-border bg-muted'}`}>
              <div className="flex flex-wrap items-center gap-3 p-3">
                <button type="button" onClick={() => toggleRole(role)} className="flex items-center gap-1 text-sm font-bold text-foreground">
                  {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  {role}
                </button>
                <span className="text-xs text-muted-foreground">
                  {roleTickets.length} {roleTickets.length === 1 ? 'Arbeitsschritt' : 'Arbeitsschritte'}
                </span>
                {missing && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-status-attention">
                    <AlertTriangle className="w-3.5 h-3.5" /> Bitte zuweisen
                  </span>
                )}
                <div className="ml-auto w-full sm:w-auto">
                  <PersonSelect
                    value={value}
                    candidates={candidates}
                    members={members}
                    onChange={(email) => chooseRole(role, email)}
                    placeholder={candidates.length ? 'Person wählen' : 'niemand mit dieser Rolle'}
                  />
                </div>
              </div>

              {expanded && (
                <div className="border-t border-border/60 divide-y divide-border/60">
                  {roleTickets.map((t) => (
                    <div key={t.key} className="flex flex-wrap items-center gap-3 px-3 py-2 bg-white/60">
                      <div className="flex-1 min-w-[160px]">
                        <p className="text-sm text-foreground">{t.title}</p>
                        <p className="text-xs text-muted-foreground">{t.milestoneName}</p>
                      </div>
                      <PersonSelect
                        value={ticketValue(t, roleAssign, overrides, members)}
                        candidates={candidates}
                        members={members}
                        onChange={(email) => setOverrides({ ...overrides, [t.key]: email })}
                        placeholder="Person wählen"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {roles.length === 0 && (
          <p className="text-sm text-muted-foreground">Die gewählten Module enthalten keine Arbeitsschritte mit Rolle.</p>
        )}
      </div>

      {plan.some((t) => ticketValue(t, roleAssign, overrides, members) === OPEN) && (
        <p className="text-xs text-muted-foreground">
          Bewusst offen gelassen: {plan.filter((t) => ticketValue(t, roleAssign, overrides, members) === OPEN).map((t) => t.title).join(', ')}
        </p>
      )}
    </div>
  );
}