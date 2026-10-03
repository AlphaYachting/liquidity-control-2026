import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { fmtDate } from '@/components/sprint/sprintConfig';
import useProjektAuftraege from '@/hooks/useProjektAuftraege';
import { terminAbweichung } from '@/lib/crm/abTermine';
import { termineAusAbUebernehmen } from '@/lib/sprint/termineAusAb';

const WOCHE = 7 * 86400000;
const kurz = (d) => fmtDate(d).slice(0, 6);
const merkSchluessel = (sprintId) => `abTerminHinweis:aus:${sprintId}`;

function istAusgeblendet(sprintId) {
  try { return window.localStorage.getItem(merkSchluessel(sprintId)) === '1'; } catch { return false; }
}

// Einzeiliger Hinweis im Projektkopf, wenn Start oder Lieferung des Sprints nicht zur
// Auftragsbestätigung passen. Er ist eine Übergangshilfe und verschwindet von selbst:
// nach dem Übernehmen, wenn er ausgeblendet wurde, sobald eine Etappe übergeben ist
// oder alle freigegeben sind. Verglichen wird nur der Sprint, der direkt aus dieser AB
// angelegt wurde (ein Auftrag, Anlage innerhalb einer Woche danach).
export default function AbTerminHinweis({ sprint, project, milestones = [], darfAendern, onUmgestellt }) {
  const [ausgeblendet, setAusgeblendet] = useState(() => istAusgeblendet(sprint?.id));
  const [frage, setFrage] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');
  const { data: orders = [] } = useProjektAuftraege(project);

  if (!sprint || ausgeblendet || orders.length !== 1) return null;
  const order = orders[0];
  const abstand = new Date(sprint.created_date) - new Date(order.created_date);
  if (!(abstand >= 0 && abstand <= WOCHE)) return null;
  if (milestones.some((m) => m.handover_date)) return null;
  if (milestones.length > 0 && milestones.every((m) => m.state === 'freigegeben')) return null;

  const { ab, abweichend } = terminAbweichung(sprint, order);
  if (!abweichend) return null;

  const laut = [ab.start && `Kick-off ${kurz(ab.start)}`, ab.lieferung && `Lieferung ${fmtDate(ab.lieferung)}`]
    .filter(Boolean).join(' · ');
  const imProjekt = [ab.start && `Start ${kurz(sprint.start_date)}`, ab.lieferung && `Lieferung ${kurz(sprint.delivery_date)}`]
    .filter(Boolean).join(' · ');

  const ausblenden = () => {
    try { window.localStorage.setItem(merkSchluessel(sprint.id), '1'); } catch { /* nur für diese Sitzung */ }
    setAusgeblendet(true);
  };

  const uebernehmen = async () => {
    setLaeuft(true);
    setFehler('');
    try {
      await termineAusAbUebernehmen({ sprint, milestones, start: ab.start, lieferung: ab.lieferung });
      onUmgestellt?.(`Termine aus der AB übernommen: ${laut}. Die Plantermine aller offenen Etappen wurden neu gerechnet.`);
    } catch (e) {
      setFehler(e.message || 'Termine konnten nicht übernommen werden.');
      setFrage(false);
    }
    setLaeuft(false);
  };

  const knopf = 'h-[30px] px-3 rounded text-[13px] cursor-pointer disabled:opacity-50';

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded border border-[#E6D5BC] bg-[#F7F0E6] px-3.5 py-2.5 text-[13px] text-[#6E4100]">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="flex-[1_1_360px]">
        {frage
          ? 'Start, Lieferung und die Plantermine aller noch nicht übergebenen Etappen werden neu gerechnet. Wirklich umstellen?'
          : <>Termine weichen von der {order.order_number || 'Auftragsbestätigung'} ab — laut AB <strong>{laut}</strong>, im Projekt {imProjekt}</>}
        {fehler && <span className="block text-status-critical">{fehler}</span>}
      </span>
      <div className="flex gap-2">
        {darfAendern && !frage && (
          <button type="button" onClick={() => setFrage(true)} className={`${knopf} border border-[#C9A97A] bg-card font-semibold`}>
            Termine übernehmen
          </button>
        )}
        {frage && (
          <>
            <button type="button" onClick={uebernehmen} disabled={laeuft} className={`${knopf} border border-[#C9A97A] bg-card font-semibold`}>
              {laeuft ? 'Stellt um…' : 'Ja, umstellen'}
            </button>
            <button type="button" onClick={() => setFrage(false)} disabled={laeuft} className={`${knopf} bg-transparent`}>Abbrechen</button>
          </>
        )}
        {!frage && (
          <button type="button" onClick={ausblenden} className={`${knopf} bg-transparent`}>Ausblenden</button>
        )}
      </div>
    </div>
  );
}
