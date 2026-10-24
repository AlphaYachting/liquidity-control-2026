import React from 'react';
import { base44 } from '@/api/base44Client';
import { ToastAction } from '@/components/ui/toast';

// Meldung nach dem Schnell-Stopp (Knopf in Mein Tag bzw. auf der Etappe — ohne Stopp-Dialog).
// Bei Festpreis-Arbeit (Sprint, Paket) bietet sie einen Klick an, um die Zeit als Mehraufwand
// (Zusatzwunsch des Kunden) zu kennzeichnen — derselbe Effekt wie der Schalter im Stopp-Dialog
// (Audit 24.10.2026: beide Stopp-Wege sollen den Mehraufwand erfassen können).
export function gebuchtMeldung(toast, res, project) {
  const text = `${res.hours} h auf ${res.projekt || project?.title || 'das Projekt'} gebucht.`;
  const frage = ['sprint', 'paket'].includes(project?.abrechnungsmodell || 'sprint') && !res.mehrleistung && res.eintragId;
  if (!frage) {
    toast({ description: res.mehrleistung ? `${text} Als Mehraufwand gekennzeichnet.` : text });
    return;
  }
  toast({
    description: text,
    duration: 8000,
    action: (
      <ToastAction
        altText="Als Mehraufwand kennzeichnen"
        onClick={async () => {
          try {
            await base44.entities.TimeEntry.update(res.eintragId, { mehrleistung: true });
            toast({ description: 'Als Mehraufwand (Zusatzwunsch) gekennzeichnet.' });
          } catch (e) {
            toast({ variant: 'destructive', description: `Nicht gespeichert: ${e?.message || e}` });
          }
        }}
      >
        War Zusatzwunsch
      </ToastAction>
    ),
  });
}
