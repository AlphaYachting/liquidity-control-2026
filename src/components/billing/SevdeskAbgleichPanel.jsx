import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, ScanSearch } from 'lucide-react';
import { toast } from 'sonner';
import SevdeskAbgleichZeile from '@/components/billing/SevdeskAbgleichZeile';

// Prüft jede Abrechnungsanweisung live gegen sevDesk. Der Prüflauf schreibt nichts —
// jede Angleichung wird einzeln bestätigt, damit keine Zuordnung blind überschrieben wird.
export default function SevdeskAbgleichPanel() {
  const queryClient = useQueryClient();
  const [laeuft, setLaeuft] = useState(false);
  const [angleichId, setAngleichId] = useState(null);
  const [ergebnis, setErgebnis] = useState(null);
  const [nurOffene, setNurOffene] = useState(true);

  const pruefen = async () => {
    setLaeuft(true);
    try {
      const res = await base44.functions.invoke('reconcileBillingInstructions', {});
      setErgebnis(res.data);
    } catch (e) {
      toast.error('Prüfung fehlgeschlagen', { description: e?.response?.data?.error || e.message });
    }
    setLaeuft(false);
  };

  const angleichen = async (fall) => {
    setAngleichId(fall.id);
    try {
      const res = await base44.functions.invoke('reconcileBillingInstructions', { apply: true, ids: [fall.id] });
      setErgebnis(res.data);
      queryClient.invalidateQueries({ queryKey: ['billingInstructions'] });
      toast.success('Anweisung auf sevDesk-Stand gebracht');
    } catch (e) {
      toast.error('Angleichen fehlgeschlagen', { description: e?.response?.data?.error || e.message });
    }
    setAngleichId(null);
  };

  const z = ergebnis?.zusammenfassung;
  const faelle = (ergebnis?.faelle || []).filter((f) => !nurOffene || f.art !== 'stimmt');

  return (
    <Card>
      <CardContent className="py-4 px-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <ScanSearch className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Abgleich mit sevDesk</p>
          <Button size="sm" variant="outline" className="h-7 text-xs ml-auto gap-1" disabled={laeuft} onClick={pruefen}>
            {laeuft ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {ergebnis ? 'Erneut prüfen' : 'Jetzt prüfen'}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Jede Anweisung wird live gegen den Beleg in sevDesk gehalten. Der Prüflauf verändert nichts;
          Angleichungen werden einzeln bestätigt. Betragsabweichungen werden nur gemeldet, nie überschrieben.
        </p>

        {z && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>{z.geprueft} geprüft</span>
            <span className="text-emerald-700">{z.stimmt} stimmen</span>
            <span className="text-amber-800">{z.abweichung} Status weicht ab</span>
            <span className="text-red-700">{z.beleg_fehlt} Beleg fehlt in sevDesk</span>
            <span className="text-blue-700">{z.eindeutiger_kandidat} eindeutig zuordenbar</span>
            <span className="text-amber-800">{z.mehrere_kandidaten} mehrdeutig</span>
            <span className="text-muted-foreground">{z.kein_kandidat} ohne Rechnung</span>
            <button className="ml-auto underline text-muted-foreground" onClick={() => setNurOffene((v) => !v)}>
              {nurOffene ? 'auch stimmige zeigen' : 'nur offene zeigen'}
            </button>
          </div>
        )}

        {faelle.length > 0 && (
          <div className="space-y-2">
            {faelle.map((f) => (
              <SevdeskAbgleichZeile key={f.id} fall={f} laeuft={angleichId === f.id} onAngleichen={angleichen} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}