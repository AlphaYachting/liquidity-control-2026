import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Undo2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { GRUND_LABEL } from '@/components/support/SupportAbschliessenDialog';

const std = (min) => ((Number(min) || 0) / 60).toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Ohne Rechnung abgeschlossene Positionen der letzten 30 Tage — Tickets, Zeit ohne Ticket,
// Regie-Tage und aWork-Altbestand — mit Zurückholen (25.11.2026)
export default function SupportNichtVerrechnet({ tickets, darfAendern, onDone }) {
  const [offen, setOffen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [fehler, setFehler] = useState('');
  if (!tickets?.length) return null;

  const schluessel = (t) => t.key || t.ticket_id || t.awork_task_id;
  const rueckgaengig = async (t) => {
    setBusy(schluessel(t));
    setFehler('');
    try {
      const ziel = t.ticket_id
        ? { ticket_id: t.ticket_id }
        : t.awork_task_id ? { awork_task_id: t.awork_task_id } : { time_entry_ids: t.time_entry_ids || [] };
      const res = await base44.functions.invoke('supportVerrechnung', { aktion: 'abschluss_rueckgaengig', ...ziel });
      if (res.data?.error) throw new Error(res.data.error);
      onDone();
    } catch (e) {
      setFehler(e?.response?.data?.error || e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="text-xs">
      <button onClick={() => setOffen((o) => !o)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
        {offen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        Ohne Rechnung abgeschlossen, letzte 30 Tage ({tickets.length})
      </button>
      {offen && (
        <ul className="mt-1 ml-5 space-y-1">
          {tickets.map((t) => (
            <li key={schluessel(t)} className="flex items-center gap-2 min-w-0">
              {t.link
                ? <Link to={t.link} className="hover:underline truncate">{t.task_title}</Link>
                : <span className="truncate">{t.task_title}</span>}
              <span className="text-muted-foreground truncate">
                — {GRUND_LABEL[t.grund] || t.grund || 'ohne Grund'}{t.notiz ? `: ${t.notiz}` : ''}
                {t.minuten > 0 ? ` · ${std(t.minuten)} h gebucht` : ''}
                {' · '}{t.von || '—'}{t.am ? `, ${new Date(t.am).toLocaleDateString('de-AT')}` : ''}
              </span>
              {darfAendern && (
                <button onClick={() => rueckgaengig(t)} disabled={busy === schluessel(t)} title="Zurückholen — erscheint wieder zur Verrechnung" className="flex-shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50">
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {fehler && <p className="mt-1 ml-5 text-red-600">{fehler}</p>}
    </div>
  );
}
