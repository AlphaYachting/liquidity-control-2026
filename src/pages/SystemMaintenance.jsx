import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/shared/PageHeader';

export default function SystemMaintenance() {
  const [läuft, setLäuft] = useState(false);
  const [ergebnis, setErgebnis] = useState(null);

  const neuAufbauen = async () => {
    setLäuft(true);
    setErgebnis(null);
    try {
      const res = await base44.functions.invoke('rebuildSearchIndex', {});
      setErgebnis(res.data);
    } catch (e) {
      setErgebnis({ error: e.message });
    }
    setLäuft(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Systempflege" subtitle="Wartungsläufe, die sonst nächtlich laufen" />
      <div className="border rounded p-4 max-w-xl">
        <p className="text-sm font-semibold">Suchindex neu aufbauen</p>
        <p className="text-xs text-muted-foreground mt-1">
          Läuft nächtlich um 03:30. Hier von Hand auslösbar — danach sehen alle Browser den neuen Stand.
        </p>
        <Button className="mt-3" onClick={neuAufbauen} disabled={läuft}>
          {läuft ? 'Baut auf …' : 'Jetzt neu aufbauen'}
        </Button>
        {ergebnis && (
          <p className="text-xs mt-3 text-muted-foreground">
            {ergebnis.error
              ? `Fehler: ${ergebnis.error}`
              : `${ergebnis.geschrieben} Zeilen geschrieben · Version ${ergebnis.version}`}
          </p>
        )}
      </div>
    </div>
  );
}