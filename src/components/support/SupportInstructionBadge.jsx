import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ExternalLink, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// Zeigt die erstellte Abrechnung. Zurücknehmen nur, solange die Rechnung in sevDesk Entwurf ist —
// eine versendete Rechnung bleibt beim Kunden, die Stunden würden sonst doppelt verrechnet (25.11.2026).
// Eine Anweisung ohne sevDesk-Rechnung (Entwurf gescheitert) lässt sich verwerfen.
export default function SupportInstructionBadge({ instruction, onDone }) {
  const [busy, setBusy] = useState(false);
  const live = instruction.live_status;
  const bezahlt = live?.status_code === '1000';
  const ohneRechnung = !instruction.sevdesk_invoice_id;
  const entwurf = live?.status_code === '100';

  const ausfuehren = async () => {
    const frage = ohneRechnung
      ? 'Anweisung ohne sevDesk-Rechnung verwerfen? Es wurde nichts verrechnet — die Positionen bleiben, wie sie sind.'
      : 'Abrechnung zurücknehmen? Die Positionen erscheinen dann wieder. Den Entwurf in sevDesk bitte dort löschen.';
    if (!window.confirm(frage)) return;
    setBusy(true);
    try {
      // Server prüft selbst: ohne sevDesk-Rechnung nur verwerfen, sonst nur bei Entwurf zurücknehmen
      const res = await base44.functions.invoke('supportAbrechnungMarkieren', { aktion: 'zuruecknehmen', billing_instruction_id: instruction.id });
      if (res.data?.error) throw new Error(res.data.error);
      onDone();
    } catch (e) {
      window.alert(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const text = live
    ? `${live.invoice_number || 'Entwurf'} — ${live.status_label}`
    : ohneRechnung ? 'Anweisung ohne sevDesk-Rechnung' : 'sevDesk-Rechnung — Status nicht abrufbar';

  return (
    <span className="flex items-center gap-1">
      <Badge className={bezahlt ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}>{text}</Badge>
      {instruction.sevdesk_invoice_url && (
        <a href={instruction.sevdesk_invoice_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
      {ohneRechnung && (
        <button onClick={ausfuehren} disabled={busy} title="Anweisung verwerfen" className="text-xs text-muted-foreground hover:text-red-600 underline disabled:opacity-50">
          Verwerfen
        </button>
      )}
      {entwurf && (
        <button onClick={ausfuehren} disabled={busy} title="Abrechnung zurücknehmen (nur Entwurf)" className="text-muted-foreground hover:text-red-600 disabled:opacity-50">
          <Undo2 className="w-3.5 h-3.5" />
        </button>
      )}
    </span>
  );
}
