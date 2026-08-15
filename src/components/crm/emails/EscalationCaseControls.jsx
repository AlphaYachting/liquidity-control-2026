import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Handshake, Clock, CheckCircle2, Loader2, Link2 } from 'lucide-react';

export const SEVERITY_STYLE = {
  1: 'bg-amber-100 text-amber-800',
  2: 'bg-orange-100 text-orange-800',
  3: 'bg-red-100 text-red-700',
};
const STATE_LABEL = { offen: 'offen', in_arbeit: 'in Arbeit', snooze: 'zurückgestellt', erledigt: 'erledigt' };

// Zuweisung und Bearbeitungsstand eines Eskalations-Vorgangs.
// Der Kommunikationsstatus des Threads wird hier NICHT verändert.
export default function EscalationCaseControls({ caseRecord, thread }) {
  const queryClient = useQueryClient();
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [snoozeDate, setSnoozeDate] = useState('');
  const [note, setNote] = useState('');

  const { data: team = [] } = useQuery({
    queryKey: ['team-members-active'],
    queryFn: () => base44.entities.TeamMember.filter({ active: true }, 'name', 100),
  });

  const save = useMutation({
    mutationFn: async (fields) => {
      if (caseRecord?.id) return base44.entities.CrmEscalation.update(caseRecord.id, fields);
      return base44.entities.CrmEscalation.create({
        thread_id: String(thread.id),
        subject: thread.subject || '',
        customer_name: thread.customer_label || '',
        severity: caseRecord?.severity || 1,
        created_at: new Date().toISOString(),
        state: 'offen',
        ...fields,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crm-escalations'] }),
  });

  const severity = caseRecord?.severity || 0;
  const state = caseRecord?.state || 'offen';

  return (
    <div className="border-t pt-2.5 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {severity > 0 && (
          <Badge variant="outline" className={`border-0 text-[10px] ${SEVERITY_STYLE[severity] || ''}`}>
            Stufe {severity}
          </Badge>
        )}
        <span className="text-[11px] text-muted-foreground">Vorgang: {STATE_LABEL[state]}</span>
        {caseRecord?.snooze_until && state === 'snooze' && (
          <span className="text-[11px] text-muted-foreground">bis {caseRecord.snooze_until.slice(0, 10)}</span>
        )}
        {caseRecord?.evidence && (
          <span className="text-[11px] text-muted-foreground italic truncate max-w-[280px]">„{caseRecord.evidence}"</span>
        )}
        {caseRecord?.linked_deal_id && (
          <Link to={`/crm/deals/${caseRecord.linked_deal_id}`} className="text-[11px] text-primary hover:underline flex items-center gap-1">
            <Link2 className="w-3 h-3" /> Deal
          </Link>
        )}
        {caseRecord?.linked_ticket_id && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Link2 className="w-3 h-3" /> Support-Ticket verknüpft
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select
          value={caseRecord?.assigned_to || '__none__'}
          onValueChange={(v) => save.mutate({ assigned_to: v === '__none__' ? '' : v })}
        >
          <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="Zuweisen" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Nicht zugewiesen</SelectItem>
            {team.map((m) => <SelectItem key={m.id} value={m.email}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={save.isPending}
          onClick={() => save.mutate({ state: 'in_arbeit' })}>
          {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Handshake className="w-3.5 h-3.5" />}
          Übernehmen
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setSnoozeOpen(true)}>
          <Clock className="w-3.5 h-3.5" /> Später
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
          onClick={() => setDoneOpen(true)}>
          <CheckCircle2 className="w-3.5 h-3.5" /> Erledigt
        </Button>
      </div>

      <Dialog open={snoozeOpen} onOpenChange={setSnoozeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Später bearbeiten</DialogTitle></DialogHeader>
          <div>
            <Label className="text-xs">Wieder anzeigen ab</Label>
            <Input type="date" value={snoozeDate} onChange={(e) => setSnoozeDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSnoozeOpen(false)}>Abbrechen</Button>
            <Button disabled={!snoozeDate} onClick={() => {
              save.mutate({ state: 'snooze', snooze_until: new Date(`${snoozeDate}T08:00:00`).toISOString() });
              setSnoozeOpen(false);
            }}>Zurückstellen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={doneOpen} onOpenChange={setDoneOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Eskalation erledigt</DialogTitle></DialogHeader>
          <div>
            <Label className="text-xs">Wie wurde die Eskalation gelöst?</Label>
            <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">
              Der Kommunikationsstatus des E-Mail-Verlaufs bleibt unverändert.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDoneOpen(false)}>Abbrechen</Button>
            <Button onClick={() => {
              save.mutate({ state: 'erledigt', resolution_note: note, resolved_at: new Date().toISOString() });
              setDoneOpen(false);
            }}>Erledigt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}