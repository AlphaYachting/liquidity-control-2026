import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Clock, CheckCircle2 } from 'lucide-react';

export const SEVERITY_STYLE = {
  1: 'bg-amber-100 text-amber-800',
  2: 'bg-orange-100 text-orange-800',
  3: 'bg-red-100 text-red-700',
};
export const STATE_LABEL = { offen: 'offen', in_arbeit: 'in Arbeit', snooze: 'zurückgestellt', erledigt: 'erledigt' };

/**
 * Bearbeitungsstand eines Eskalations-Vorgangs als Aktionen für die gemeinsame Post-Aktionsleiste
 * („Mehr“): später bearbeiten, Vorgang erledigen. Standänderungen gelten für die ganze Konversation,
 * auch für Vorgänge in Parallel-Verläufen. Der Kommunikationsstatus des Verlaufs bleibt unverändert.
 * Die Zuständigkeit läuft über die normale Post-Zuweisung (ZuweisungWahl).
 */
export function useVorgangAktionen({ caseRecord, thread, weitereFaelle = [] }) {
  const queryClient = useQueryClient();
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [snoozeDate, setSnoozeDate] = useState('');
  const [note, setNote] = useState('');

  const save = useMutation({
    mutationFn: async (fields) => {
      if (fields.state && weitereFaelle.length) {
        await Promise.all(weitereFaelle.filter((c) => c.id).map((c) => base44.entities.CrmEscalation.update(c.id, fields)));
      }
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-escalations'] });
      queryClient.invalidateQueries({ queryKey: ['eskalations-liste'] });
      queryClient.invalidateQueries({ queryKey: ['posteingang'] });
    },
  });

  const mehr = [
    { key: 'spaeter', label: 'Vorgang später bearbeiten …', icon: Clock, onClick: () => setSnoozeOpen(true), trenner: true },
    { key: 'vorgang-erledigt', label: 'Vorgang erledigt …', icon: CheckCircle2, onClick: () => setDoneOpen(true) },
  ];

  const dialoge = (
    <>
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
    </>
  );

  return { mehr, dialoge, busy: save.isPending };
}
