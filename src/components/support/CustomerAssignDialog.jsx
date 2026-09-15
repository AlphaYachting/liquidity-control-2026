import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search } from 'lucide-react';

// Support-Anfragen brauchen kein Projekt im Cockpit — hier wird der Kunde direkt
// aus sevDesk zugewiesen, damit die Rechnung erstellt werden kann.
export default function CustomerAssignDialog({ tasks, vorschlag, open, onOpenChange, onDone }) {
  const [suche, setSuche] = useState(vorschlag || '');
  const [treffer, setTreffer] = useState([]);
  const [gesucht, setGesucht] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');

  const suchen = async () => {
    setBusy(true);
    setFehler('');
    try {
      const res = await base44.functions.invoke('fetchSevdeskContacts', { query: suche });
      setTreffer(res.data?.contacts || []);
      setGesucht(true);
      if (res.data?.error) setFehler(res.data.error);
    } catch (e) {
      setFehler(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const zuweisen = async (kontakt) => {
    setBusy(true);
    setFehler('');
    try {
      for (const t of tasks) {
        const vorhanden = await base44.entities.SupportTicketCustomer.filter({ awork_task_id: t.awork_task_id });
        const daten = {
          awork_task_id: t.awork_task_id,
          customer_name: kontakt.name,
          sevdesk_contact_id: kontakt.sevdesk_contact_id,
        };
        if (vorhanden[0]) await base44.entities.SupportTicketCustomer.update(vorhanden[0].id, daten);
        else await base44.entities.SupportTicketCustomer.create(daten);
      }
      onDone();
      onOpenChange(false);
    } catch (e) {
      setFehler(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Kunde zuweisen — {tasks.length === 1 ? tasks[0].task_title : `${tasks.length} Anfragen`}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Kunde in sevDesk suchen</Label>
            <div className="flex gap-2 mt-1">
              <Input value={suche} onChange={(e) => setSuche(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && suchen()} placeholder="Firmenname" />
              <Button variant="outline" onClick={suchen} disabled={busy || !suche.trim()}>
                <Search className="w-3.5 h-3.5" /> Suchen
              </Button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto border rounded-lg divide-y">
            {treffer.map(k => (
              <button
                key={k.sevdesk_contact_id}
                onClick={() => zuweisen(k)}
                disabled={busy}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between gap-3"
              >
                <span className="truncate">{k.name}</span>
                <span className="text-xs text-muted-foreground flex-shrink-0">{k.customer_number || '—'}</span>
              </button>
            ))}
            {gesucht && treffer.length === 0 && (
              <p className="px-3 py-3 text-xs text-muted-foreground">Kein Kunde gefunden — bitte anderen Suchbegriff versuchen.</p>
            )}
            {!gesucht && <p className="px-3 py-3 text-xs text-muted-foreground">Suchbegriff eingeben und suchen.</p>}
          </div>

          {fehler && <p className="text-xs text-red-600">{fehler}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}