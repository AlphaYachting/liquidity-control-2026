import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ladeVorschau, uebernehmen } from '@/lib/support/aworkUebernahme';

const std = (min) => ((Number(min) || 0) / 60).toFixed(2);

// Vorschau vor dem Ausführen: Kunde je Aufgabe prüfen und korrigieren
export default function AworkUebernahmeDialog({ open, onOpenChange, onDone }) {
  const [daten, setDaten] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');
  const [ergebnis, setErgebnis] = useState(null);

  useEffect(() => {
    ladeVorschau().then(setDaten).catch(e => setFehler(e.message));
  }, []);

  const setzeKunde = (id, clientId) =>
    setDaten(d => ({ ...d, eintraege: d.eintraege.map(e => e.awork_task_id === id ? { ...e, client_id: clientId } : e) }));

  const ausfuehren = async () => {
    setBusy(true);
    setFehler('');
    try {
      setErgebnis(await uebernehmen(daten.eintraege, daten.clients));
      onDone();
    } catch (e) {
      setFehler(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Offene aWork-Support-Aufgaben übernehmen</DialogTitle></DialogHeader>
        {!daten ? (
          fehler ? <p className="text-xs text-red-600">{fehler}</p> : <Skeleton className="h-40" />
        ) : (
          <div className="max-h-[60vh] overflow-y-auto border rounded-lg divide-y">
            {daten.eintraege.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">Keine offenen Aufgaben gefunden.</p>}
            {daten.eintraege.map(e => (
              <div key={e.awork_task_id} className="flex items-center gap-3 px-3 py-2 text-xs">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{e.titel}</p>
                  <p className="text-muted-foreground truncate">
                    Präfix „{e.praefix || '—'}" · {e.aw_status} · {e.assignee_name || '—'}{e.assignee_email ? '' : ' (nicht zugeordnet)'} · Vorleistung {std(e.vorleistung_minuten)} h
                  </p>
                </div>
                {e.bereits ? (
                  <span className="text-muted-foreground flex-shrink-0">bereits übernommen</span>
                ) : (
                  <select
                    value={e.client_id}
                    onChange={(ev) => setzeKunde(e.awork_task_id, ev.target.value)}
                    className={`h-8 w-48 flex-shrink-0 rounded-md border bg-background px-2 ${e.client_id ? '' : 'border-red-300 text-red-600'}`}
                  >
                    <option value="">Kunde fehlt</option>
                    {daten.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
        )}
        {ergebnis && (
          <p className="text-xs">
            {ergebnis.uebernommen} übernommen · {ergebnis.uebersprungen} übersprungen · {ergebnis.kunde_fehlt} Kunde fehlt
          </p>
        )}
        {fehler && daten && <p className="text-xs text-red-600">{fehler}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
          <Button onClick={ausfuehren} disabled={busy || !daten || !!ergebnis}>
            {busy ? 'Wird übernommen...' : 'Übernehmen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}