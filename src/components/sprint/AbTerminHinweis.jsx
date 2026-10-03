import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmtDate } from '@/components/sprint/sprintConfig';
import useProjektAuftraege from '@/hooks/useProjektAuftraege';
import { terminAbweichung } from '@/lib/crm/abTermine';
import { termineAusAbUebernehmen } from '@/lib/sprint/termineAusAb';

const WOCHE = 7 * 86400000;

// Zeigt im Projektkopf, wenn Start oder Lieferung des Sprints nicht zur Auftragsbestätigung passen.
// Verglichen wird nur der Sprint, der direkt aus dieser AB angelegt wurde (ein Auftrag, Anlage
// innerhalb einer Woche danach) — Folgesprints haben eigene Termine.
export default function AbTerminHinweis({ sprint, project, milestones = [], darfAendern, onChanged }) {
  const [frage, setFrage] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');
  const { data: orders = [] } = useProjektAuftraege(project);

  if (!sprint || orders.length !== 1) return null;
  const order = orders[0];
  const abstand = new Date(sprint.created_date) - new Date(order.created_date);
  if (!(abstand >= 0 && abstand <= WOCHE)) return null;
  if (milestones.length > 0 && milestones.every((m) => m.state === 'freigegeben')) return null;

  const { ab, abweichend } = terminAbweichung(sprint, order);
  if (!abweichend) return null;

  const laut = [ab.start && `Kick-off ${fmtDate(ab.start)}`, ab.lieferung && `Lieferung ${fmtDate(ab.lieferung)}`]
    .filter(Boolean).join(' · ');
  const imProjekt = [ab.start && `Start ${fmtDate(sprint.start_date)}`, ab.lieferung && `Lieferung ${fmtDate(sprint.delivery_date)}`]
    .filter(Boolean).join(' · ');

  const uebernehmen = async () => {
    setLaeuft(true);
    setFehler('');
    try {
      await termineAusAbUebernehmen({ sprint, milestones, start: ab.start, lieferung: ab.lieferung });
      setFrage(false);
      onChanged?.();
    } catch (e) {
      setFehler(e.message || 'Termine konnten nicht übernommen werden.');
    }
    setLaeuft(false);
  };

  return (
    <div className="rounded border border-status-attention/40 bg-status-attention-surface px-4 py-2.5 text-sm text-status-attention">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="flex-1 min-w-[240px]">
          Termine weichen von der Auftragsbestätigung {order.order_number || ''} ab —
          laut AB: <span className="font-semibold">{laut}</span>, im Projekt: {imProjekt}.
        </span>
        {darfAendern && !frage && (
          <Button size="sm" variant="outline" className="rounded" onClick={() => setFrage(true)}>
            Termine aus der AB übernehmen
          </Button>
        )}
      </div>
      {frage && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-status-attention/30 pt-2">
          <span className="flex-1 min-w-[240px] text-foreground">
            Start, Lieferung und die Plantermine aller noch nicht übergebenen Etappen werden neu gerechnet.
            Zeiten, die vor dem neuen Start gebucht wurden, zählen im Kopf dann nicht mehr mit.
          </span>
          <Button size="sm" className="rounded" disabled={laeuft} onClick={uebernehmen}>
            {laeuft ? 'Stellt um…' : 'Ja, umstellen'}
          </Button>
          <Button size="sm" variant="ghost" disabled={laeuft} onClick={() => setFrage(false)}>Abbrechen</Button>
        </div>
      )}
      {fehler && <p className="mt-2 text-status-critical">{fehler}</p>}
    </div>
  );
}
