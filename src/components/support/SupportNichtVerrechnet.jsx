import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Undo2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { GRUND_LABEL } from '@/components/support/SupportNichtVerrechnenDialog';

// Bewusst nicht verrechnete Tickets der letzten 30 Tage — mit Rückgängig
export default function SupportNichtVerrechnet({ tickets, darfAendern, onDone }) {
  const [offen, setOffen] = useState(false);
  const [busy, setBusy] = useState(null);
  if (!tickets?.length) return null;

  const rueckgaengig = async (t) => {
    setBusy(t.ticket_id);
    try {
      const res = await base44.functions.invoke('supportVerrechnung', { aktion: 'rueckgaengig', ticket_id: t.ticket_id });
      if (res.data?.error) throw new Error(res.data.error);
      onDone();
    } catch (e) {
      window.alert(e?.response?.data?.error || e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="text-xs">
      <button onClick={() => setOffen((o) => !o)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
        {offen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        Nicht verrechnet, letzte 30 Tage ({tickets.length})
      </button>
      {offen && (
        <ul className="mt-1 ml-5 space-y-1">
          {tickets.map((t) => (
            <li key={t.ticket_id} className="flex items-center gap-2">
              <Link to={t.link} className="hover:underline truncate">{t.task_title}</Link>
              <span className="text-muted-foreground truncate">
                — {GRUND_LABEL[t.grund] || t.grund}{t.notiz ? `: ${t.notiz}` : ''} · {t.von || '—'}{t.am ? `, ${new Date(t.am).toLocaleDateString('de-AT')}` : ''}
              </span>
              {darfAendern && (
                <button onClick={() => rueckgaengig(t)} disabled={busy === t.ticket_id} title="Rückgängig" className="flex-shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50">
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
