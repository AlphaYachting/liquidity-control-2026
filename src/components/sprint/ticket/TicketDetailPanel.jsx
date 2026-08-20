import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SectionLabel from '@/components/sprint/SectionLabel';
import TicketChecklist from '@/components/sprint/ticket/TicketChecklist';
import TicketLinks from '@/components/sprint/ticket/TicketLinks';
import { ROLES, TICKET_STATUSES, TICKET_STATUS_LABELS, STATE_LABELS } from '@/components/sprint/sprintConfig';

const STATES = ['input', 'produktion', 'pruefung', 'kundenfeedback'];
const ORIGIN_LABEL = {
  pflicht: 'Pflichtaufgabe',
  addon: 'Zusatz',
  change_request: 'Change Request · nach Aufwand abrechenbar',
  support: 'Support',
};
const h1 = (v) => (v || 0).toLocaleString('de-AT', { maximumFractionDigits: 1 });

// Arbeitsplatz eines Tickets: Inhalt, Checkliste, Verweise, Zuständigkeit, Plan gegen Ist
export default function TicketDetailPanel({ ticket, members = [], open, onOpenChange, onSaved }) {
  const [form, setForm] = useState(ticket || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(ticket || {}); }, [ticket?.id, open]);

  const { data: gebucht = 0 } = useQuery({
    enabled: Boolean(open && ticket?.id),
    queryKey: ['ticketHours', ticket?.id],
    queryFn: async () => {
      const rows = await base44.entities.TimeEntry.filter({ ticket_id: ticket.id }, '-entry_date', 500);
      return rows.reduce((s, r) => s + (r.hours || 0), 0);
    },
  });

  if (!ticket) return null;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const plan = Number(form.target_hours) || 0;
  const pct = plan > 0 ? Math.min(100, Math.round((gebucht / plan) * 100)) : 0;

  const speichern = async () => {
    setSaving(true);
    await base44.entities.Ticket.update(ticket.id, {
      title: form.title,
      description: form.description || '',
      checklist: form.checklist || [],
      links: form.links || [],
      assignee_email: form.assignee_email || '',
      role: form.role,
      milestone_state: form.milestone_state,
      status: form.status,
      target_hours: plan || undefined,
      ...(form.status !== ticket.status ? { last_status_change: new Date().toISOString() } : {}),
    });
    setSaving(false);
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left text-base">Aufgabe</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
              {ORIGIN_LABEL[ticket.origin] || ticket.origin}
            </span>
            {ticket.customer_name && (
              <span className="text-xs text-muted-foreground">{ticket.customer_name}</span>
            )}
            {ticket.source_thread_id && (
              <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
                <Link to={`/crm/emails?thread=${ticket.source_thread_id}`}>
                  <Mail className="w-3.5 h-3.5" /> Kundenkonversation öffnen
                </Link>
              </Button>
            )}
          </div>

          <Input value={form.title || ''} onChange={(e) => set({ title: e.target.value })} className="font-semibold" />

          <div>
            <SectionLabel className="mb-1.5">Beschreibung</SectionLabel>
            <Textarea rows={5} value={form.description || ''} onChange={(e) => set({ description: e.target.value })}
              placeholder="Was ist zu tun, worauf kommt es an?" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <SectionLabel className="mb-1.5">Person</SectionLabel>
              <Select value={form.assignee_email || 'none'}
                onValueChange={(v) => set({ assignee_email: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">nicht zugewiesen</SelectItem>
                  {members.map((m) => <SelectItem key={m.email} value={m.email}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <SectionLabel className="mb-1.5">Rolle</SectionLabel>
              <Select value={form.role || ''} onValueChange={(v) => set({ role: v })}>
                <SelectTrigger><SelectValue placeholder="Rolle wählen" /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <SectionLabel className="mb-1.5">Etappe</SectionLabel>
              <Select value={form.milestone_state || 'produktion'} onValueChange={(v) => set({ milestone_state: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATES.map((s) => <SelectItem key={s} value={s}>{STATE_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <SectionLabel className="mb-1.5">Status</SectionLabel>
              <Select value={form.status || 'offen'} onValueChange={(v) => set({ status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{TICKET_STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <SectionLabel className="mb-1.5">Stunden</SectionLabel>
            <div className="flex items-center gap-3">
              <Input type="number" step="0.5" className="h-8 w-24" value={form.target_hours ?? ''}
                onChange={(e) => set({ target_hours: e.target.value })} placeholder="Plan" />
              <div className="flex-1">
                <p className="text-xs font-semibold">{h1(gebucht)} von {h1(plan)} h gebucht</p>
                <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-foreground" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>
          </div>

          <div>
            <SectionLabel className="mb-1.5">Checkliste</SectionLabel>
            <TicketChecklist items={form.checklist || []} onChange={(checklist) => set({ checklist })} />
          </div>

          <div>
            <SectionLabel className="mb-1.5">Verweise</SectionLabel>
            <TicketLinks items={form.links || []} onChange={(links) => set({ links })} />
          </div>

          <div className="flex gap-2 pb-4">
            <Button onClick={speichern} disabled={saving}>Speichern</Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Schließen</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}