import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Loader2, ClipboardCheck } from 'lucide-react';
import { fmtEUR } from '@/components/sprint/sprintConfig';
import ZumProjektLink from '@/components/projekt/ZumProjektLink';
import { projektZumAuftrag, wizardAusAuftrag } from '@/lib/crm/auftragZuWizard';
import { sevdeskBelegNachholen } from '@/lib/crm/handoverCommit';

// Zum Deal gibt es schon einen Auftrag — kein zweites Übergabeblatt.
// Fehlen die sevDesk-Belege (z. B. weil der sevDesk-Kontakt ungültig war), lassen sie sich hier nachholen.
export default function BestehenderAuftrag({ order, deal, onCancel }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [belegBusy, setBelegBusy] = useState(false);
  const [belegMeldung, setBelegMeldung] = useState(null);
  const [abNummer, setAbNummer] = useState(order.order_number || '');
  const belegFehlt = !order.sevdesk_order_id && !abNummer;
  const { data: projektId, isLoading } = useQuery({
    queryKey: ['auftrag-projekt', order.id, order.project_id],
    queryFn: () => projektZumAuftrag(order),
  });

  const anlegen = async () => {
    setBusy(true);
    try {
      navigate('/sprint/neu', { state: await wizardAusAuftrag(order, deal) });
    } finally {
      setBusy(false);
    }
  };

  const belegNachholen = async () => {
    setBelegBusy(true);
    setBelegMeldung(null);
    try {
      const r = await sevdeskBelegNachholen(order);
      if (r.success) {
        setAbNummer(r.order_number || 'angelegt');
        setBelegMeldung({ ok: true, text: `Angebot und Auftragsbestätigung sind in sevDesk angelegt${r.order_number ? ` (${r.order_number})` : ''}.` });
        queryClient.invalidateQueries({ queryKey: ['uebergabe-kontext', deal.id] });
      } else {
        setBelegMeldung({ ok: false, text: r.error });
      }
    } catch (e) {
      setBelegMeldung({ ok: false, text: e?.message || 'sevDesk nicht erreichbar' });
    } finally {
      setBelegBusy(false);
    }
  };

  return (
    <div className="border rounded-lg bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold">Auftrag besteht bereits</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
        <p><span className="text-muted-foreground">Nummer: </span>{abNummer || order.order_number || '—'}</p>
        <p><span className="text-muted-foreground">Betrag netto: </span>{fmtEUR(order.total_net_amount)}</p>
        <p><span className="text-muted-foreground">Projekt: </span>{isLoading ? '…' : projektId ? 'ja' : 'nein'}</p>
      </div>
      {belegFehlt && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 space-y-2">
          <p className="text-xs text-amber-800">
            In sevDesk gibt es zu diesem Auftrag noch kein Angebot und keine Auftragsbestätigung.
            Positionen und Umfang werden aus dem Auftrag übernommen, der sevDesk-Kontakt aus dem Kundenverzeichnis.
          </p>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={belegNachholen} disabled={belegBusy}>
            {belegBusy && <Loader2 className="animate-spin" />} Angebot &amp; AB in sevDesk anlegen
          </Button>
        </div>
      )}
      {belegMeldung && (
        <p className={`text-xs ${belegMeldung.ok ? 'text-emerald-700' : 'text-destructive'}`}>{belegMeldung.text}</p>
      )}
      <div className="flex justify-end gap-2 border-t pt-3">
        {onCancel && <Button variant="outline" onClick={onCancel}>Schließen</Button>}
        {isLoading ? null : projektId ? (
          <ZumProjektLink projectRefId={projektId} />
        ) : (
          <Button variant="outline" onClick={anlegen} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Projekt anlegen
          </Button>
        )}
      </div>
    </div>
  );
}
