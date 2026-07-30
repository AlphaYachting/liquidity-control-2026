import React, { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import {
  TICKET_STATUSES, TICKET_STATUS_LABELS, STATE_LABELS,
} from '@/components/sprint/sprintConfig';

// Tickets nach Phase gruppiert — die Gruppe des aktuellen Zustands ist aufgeklappt.
export default function TicketPhasenGruppe({ phase, tickets, currentState, members, locked, onStatus, onAssignee }) {
  const [open, setOpen] = useState(phase === currentState);
  const doneCount = tickets.filter((t) => t.status === 'erledigt').length;

  return (
    <div className="rounded border border-[#e5e5e5]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        {open ? <ChevronDown className="w-4 h-4 text-[#999999]" /> : <ChevronRight className="w-4 h-4 text-[#999999]" />}
        <span className="text-xs font-bold uppercase tracking-wide text-[#2d2d2d]">{STATE_LABELS[phase]}</span>
        <span className="text-xs text-[#999999]">{doneCount}/{tickets.length} erledigt</span>
      </button>

      {open && (
        <div className="p-2 space-y-2 border-t border-[#e5e5e5]">
          {tickets.map((t) => {
            const editable = !locked || t.milestone_state === 'kundenfeedback';
            return (
              <div key={t.id} className="flex flex-col lg:flex-row lg:items-center gap-2 rounded bg-[#f5f5f5] px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#2d2d2d] flex items-center gap-1.5">
                    {t.title}
                    {t.blocks_others && <AlertTriangle className="w-3.5 h-3.5 text-[#f5a623]" title="Blockiert andere Aufgaben" />}
                  </p>
                  <p className="text-[11px] text-[#999999]">
                    {t.role || '—'} · {t.origin}{t.target_hours ? ` · ${t.target_hours} h` : ''}
                  </p>
                </div>
                <Select
                  value={t.assignee_email || 'none'}
                  onValueChange={(v) => onAssignee(t, v === 'none' ? '' : v)}
                  disabled={locked}
                >
                  <SelectTrigger className="lg:w-56 h-8 bg-white"><SelectValue placeholder="Verantwortlich" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Kein Verantwortlicher</SelectItem>
                    {members.map((m) => <SelectItem key={m.email} value={m.email}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={t.status} onValueChange={(v) => onStatus(t, v)} disabled={!editable}>
                  <SelectTrigger className="lg:w-36 h-8 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TICKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{TICKET_STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
          {tickets.length === 0 && <p className="text-sm text-[#999999] px-1 py-2">Keine Aufgaben in dieser Phase.</p>}
        </div>
      )}
    </div>
  );
}