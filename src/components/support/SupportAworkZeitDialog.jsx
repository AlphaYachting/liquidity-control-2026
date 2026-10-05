import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Zeit, die in aWork („RITTLER - Supportanfragen") auf eine parallele Aufgabe gebucht wurde,
// als Vorleistung an das App-Ticket hängen — damit sie verrechnet wird, aber nur einmal.
export default function SupportAworkZeitDialog({ task, open, onOpenChange, onDone }) {
  const [daten, setDaten] = useState(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');

  useEffect(() => {
    if (!open) return;
    let abgebrochen = false;
    setFehler('');
    base44.functions.invoke('supportVerrechnung', { aktion: 'awork_vorschlag', ticket_id: task.ticket_id })
      .then((res) => {
        if (abgebrochen) return;
        if (res.data?.error) setFehler(res.data.error);
        setDaten(res.data || { vorschlaege: [] });
      })
      .catch((e) => { if (!abgebrochen) { setFehler(e?.response?.data?.error || e.message); setDaten({ vorschlaege: [] }); } });
    return () => { abgebrochen = true; };
  }, [open, task.ticket_id]);

  const aktion = async (body) => {
    setBusy(true);
    setFehler('');
    try {
      const res = await base44.functions.invoke('supportVerrechnung', { ...body, ticket_id: task.ticket_id });
      if (res.data?.error) throw new Error(res.data.error);
      onDone();
      onOpenChange(false);
    } catch (e) {
      setFehler(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const f = filter.trim().toLowerCase();
  const liste = (daten?.vorschlaege || []).filter((v) => !f || v.titel.toLowerCase().includes(f));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>aWork-Zeit zuordnen — {task.task_title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {task.awork_task_id ? (
            <div className="flex items-center justify-between gap-3 border rounded-lg px-3 py-2 text-sm">
              <span>Zugeordnet: {(task.vorleistung_minutes / 60).toFixed(2)} h aus aWork</span>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => aktion({ aktion: 'awork_loesen' })}>Zuordnung lösen</Button>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Offene, noch nicht verrechnete Buchungen aus „RITTLER - Supportanfragen" seit 24.07.2026. Aufgaben des Kunden {daten?.kunde ? `„${daten.kunde}" ` : ''}stehen oben.
              </p>
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Aufgaben filtern" />
              <div className="max-h-72 overflow-y-auto border rounded-lg divide-y">
                {!daten && <p className="px-3 py-3 text-xs text-muted-foreground">aWork-Aufgaben werden geladen…</p>}
                {daten && liste.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">Keine offene aWork-Zeit gefunden.</p>}
                {liste.map((v) => (
                  <button
                    key={v.awork_task_id}
                    disabled={busy}
                    onClick={() => aktion({ aktion: 'awork_zuordnen', awork_task_id: v.awork_task_id })}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between gap-3 ${v.passt ? 'bg-amber-50' : ''}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{v.titel}</span>
                      <span className="block text-xs text-muted-foreground truncate">{v.personen || '—'} · letzte Buchung {v.letzte || '—'}</span>
                    </span>
                    <span className="text-xs font-medium flex-shrink-0">{(v.minuten / 60).toFixed(2)} h</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {fehler && <p className="text-xs text-red-600">{fehler}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
