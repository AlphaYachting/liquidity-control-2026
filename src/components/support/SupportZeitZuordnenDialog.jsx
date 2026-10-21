import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { TICKET_STATUS_LABELS } from '@/components/sprint/sprintConfig';

const datumKurz = (d) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.` : '—');

// „Zeit ohne Ticket" einem Ticket desselben Support-Projekts zuordnen (21.10.2026).
// Dann gilt für die Zeit das Ticket — kein zweites 0,5-h-Minimum, und die Zeit erscheint
// erst zur Verrechnung, wenn das Ticket erledigt ist. Geändert wird nur die Ticketzuordnung.
export default function SupportZeitZuordnenDialog({ task, open, onOpenChange, onDone }) {
  const buchungen = task?.buchungen || [];
  const [gewaehlt, setGewaehlt] = useState([]);
  const [ticketId, setTicketId] = useState('');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');

  useEffect(() => {
    if (!open) return;
    setGewaehlt(buchungen.map((b) => b.id));
    setTicketId('');
    setFehler('');
  }, [open, task?.key]);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['support-zuordnen-tickets', task?.project_id],
    enabled: open && !!task?.project_id,
    queryFn: async () => (await base44.entities.Ticket.filter({ project_id: task.project_id }, '-created_date', 100))
      .filter((t) => !t.archiviert && t.verrechnung_status !== 'verrechnet'),
  });

  const ziel = tickets.find((t) => t.id === ticketId);
  const minuten = buchungen.filter((b) => gewaehlt.includes(b.id)).reduce((s, b) => s + (b.minuten || 0), 0);

  const zuordnen = async () => {
    setBusy(true);
    setFehler('');
    try {
      const res = await base44.functions.invoke('supportVerrechnung', { aktion: 'zeit_zuordnen', time_entry_ids: gewaehlt, ticket_id: ticketId });
      if (res.data?.error) throw new Error(res.data.error);
      onDone?.();
      onOpenChange(false);
    } catch (e) {
      setFehler(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle>Zeit ohne Ticket zuordnen</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold">Buchungen</p>
            {buchungen.length === 0 && <p className="text-xs text-muted-foreground">Keine Einzelbuchungen gefunden — bitte „Neu prüfen".</p>}
            {buchungen.map((b) => (
              <label key={b.id} className="flex items-start gap-2 text-xs cursor-pointer">
                <Checkbox
                  className="mt-0.5"
                  checked={gewaehlt.includes(b.id)}
                  onCheckedChange={(c) => setGewaehlt((s) => (c ? [...s, b.id] : s.filter((x) => x !== b.id)))}
                />
                <span>
                  <span className="text-muted-foreground">{datumKurz(b.datum)} {b.person} · {Math.round(b.minuten)} min:</span>{' '}
                  {b.text || <em className="text-status-attention">ohne Beschreibung</em>}
                </span>
              </label>
            ))}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold">Zu welchem Ticket gehört die Zeit?</p>
            {isLoading && <p className="text-xs text-muted-foreground">Tickets werden geladen …</p>}
            {!isLoading && tickets.length === 0 && <p className="text-xs text-muted-foreground">Im Projekt gibt es kein offenes oder unverrechnetes Ticket.</p>}
            {tickets.map((t) => (
              <label key={t.id} className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="radio" name="ziel_ticket" className="mt-1" checked={ticketId === t.id} onChange={() => setTicketId(t.id)} />
                <span>
                  {t.title}
                  <span className="block text-xs text-muted-foreground">{TICKET_STATUS_LABELS?.[t.status] || t.status}</span>
                </span>
              </label>
            ))}
          </div>

          {ziel && ziel.status !== 'erledigt' && (
            <p className="text-xs text-status-attention">
              Das Ticket ist noch nicht erledigt — die Zeit verschwindet aus dieser Liste und kommt mit dem Ticket zur Verrechnung, sobald es erledigt ist.
            </p>
          )}
          {fehler && <p className="text-xs text-red-600">{fehler}</p>}
        </div>
        <DialogFooter className="px-6 py-3 border-t shrink-0 sm:items-center">
          <p className="text-xs text-muted-foreground sm:mr-auto">{gewaehlt.length} Buchung(en) · {Math.round(minuten)} min</p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={zuordnen} disabled={busy || !ticketId || gewaehlt.length === 0}>
            {busy ? 'Wird zugeordnet…' : 'Zuordnen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
