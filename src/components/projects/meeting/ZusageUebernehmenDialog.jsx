import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import ZusageAufgabeFelder, { useAufgabenKontext, leereZusage, zusageAlsTicket } from '@/components/projects/meeting/ZusageAufgabeFelder';
import { legeTicketsAn } from '@/lib/sprint/ticketAnlage';
import { formatEntryDate } from '@/components/projects/kundenakt/kundenaktConfig';

// Einmalige Übernahme einer bisherigen Zusage (Textfeld am Projektakt-Eintrag) in eine Aufgabe.
// Danach gilt die Zusage im Projektakt als erledigt — geführt wird sie nur noch als Ticket.
export default function ZusageUebernehmenDialog({ eintrag, onClose, onDone }) {
  const { ctx, leitung, user } = useAufgabenKontext(eintrag?.project_id, !!eintrag);
  const [wert, setWert] = useState(leereZusage());
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');

  useEffect(() => {
    if (eintrag) setWert(leereZusage(eintrag.follow_up_text || '', eintrag.follow_up_date || ''));
    setFehler('');
  }, [eintrag?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { gruende } = ctx ? zusageAlsTicket(wert, { ctx, leitung }) : { gruende: ['lädt'] };

  const uebernehmen = async () => {
    if (laeuft || gruende.length) return;
    setLaeuft(true); setFehler('');
    try {
      const { ticket } = zusageAlsTicket(wert, {
        ctx, leitung, projektaktId: eintrag.id,
        herkunftText: `Übernommen aus Zusage im Projektakt („${eintrag.title || 'Eintrag'}“ vom ${formatEntryDate(eintrag.entry_date || eintrag.created_date)}).`,
      });
      const res = await legeTicketsAn([ticket], { projectId: eintrag.project_id });
      if (res.fehler.length) throw new Error(res.fehler[0].grund);
      await base44.entities.ProjectFileEntry.update(eintrag.id, { follow_up_done: true });
      onDone?.();
      onClose();
    } catch (e) {
      setFehler(e?.message || 'Übernahme fehlgeschlagen');
    }
    setLaeuft(false);
  };

  return (
    <Dialog open={!!eintrag} onOpenChange={(v) => { if (!v && !laeuft) onClose(); }}>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader><DialogTitle className="text-base">Zusage als Aufgabe übernehmen</DialogTitle></DialogHeader>
        {eintrag && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Aus „{eintrag.title || 'Eintrag'}“ · {formatEntryDate(eintrag.entry_date || eintrag.created_date)}
            </p>
            <ZusageAufgabeFelder ctx={ctx} leitung={leitung} user={user} wert={wert} onChange={setWert} disabled={laeuft} />
            {fehler && <p className="text-xs text-destructive">{fehler}</p>}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={onClose} disabled={laeuft}>Abbrechen</Button>
              <Button size="sm" className="gap-2" onClick={uebernehmen} disabled={laeuft || gruende.length > 0}>
                {laeuft && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Als Aufgabe anlegen
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
