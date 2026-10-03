import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, Link2, Loader2, Search } from 'lucide-react';
import { findeKundeNachSevdesk, kundenSchluessel } from '@/lib/kunden/kundeAnlegen';

// Sammelabgleich: alle Kunden ohne sevDesk-Verknüpfung auf einer Liste.
// Je Kunde wird in sevDesk nach dem Namen gesucht; verknüpft wird nur, was
// ausdrücklich je Zeile bestätigt wird. In sevDesk wird nichts verändert.
export default function SevdeskAbgleichDialog({ open, onOpenChange, clients = [], onSaved }) {
  const [zeilen, setZeilen] = useState([]);
  const lauf = useRef(0);

  const setze = (id, patch) => setZeilen((z) => z.map((r) => (r.client.id === id ? { ...r, ...patch } : r)));

  const suche = async (client, begriff) => {
    setze(client.id, { status: 'laedt', fehler: '' });
    const res = await base44.functions.invoke('fetchSevdeskContacts', { query: begriff }).catch((e) => ({ data: { error: e?.message } }));
    const treffer = res?.data?.contacts || [];
    // Vorauswahl nur bei genau einem namensgleichen Kontakt — sonst wählt der Mensch
    const gleich = treffer.filter((k) => kundenSchluessel(k.name) === kundenSchluessel(client.name));
    setze(client.id, {
      status: 'bereit', treffer,
      wahl: gleich.length === 1 ? gleich[0].sevdesk_contact_id : '',
      fehler: res?.data?.error || '',
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    const meinLauf = ++lauf.current;
    const offene = clients.filter((c) => !c.sevdesk_contact_id);
    setZeilen(offene.map((client) => ({ client, begriff: client.name, treffer: [], wahl: '', status: 'wartet', fehler: '' })));
    (async () => {
      for (const client of offene) {
        if (lauf.current !== meinLauf) return;
        await suche(client, client.name);
      }
    })();
    return () => { lauf.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const verknuepfen = async (zeile) => {
    const kontakt = zeile.treffer.find((k) => k.sevdesk_contact_id === zeile.wahl);
    if (!kontakt) return;
    setze(zeile.client.id, { status: 'speichert', fehler: '' });
    try {
      const belegt = await findeKundeNachSevdesk(kontakt.sevdesk_contact_id, zeile.client.id);
      if (belegt) throw new Error(`Dieser sevDesk-Kontakt gehört bereits zum Kunden „${belegt.name}"`);
      const patch = { sevdesk_contact_id: kontakt.sevdesk_contact_id };
      if (kontakt.street || kontakt.city) {
        Object.assign(patch, {
          street: kontakt.street || '', zip: kontakt.zip || '', city: kontakt.city || '',
          country_code: kontakt.country_code || 'AT',
        });
      }
      await base44.entities.Client.update(zeile.client.id, patch);
      setze(zeile.client.id, { status: 'verknuepft' });
    } catch (e) {
      setze(zeile.client.id, { status: 'bereit', fehler: e?.message || 'Nicht gespeichert' });
    }
  };

  const fertig = zeilen.filter((z) => z.status === 'verknuepft').length;
  const schliessen = () => { onOpenChange(false); if (fertig) onSaved?.(); };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : schliessen())}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="uppercase font-bold text-foreground">
            sevDesk-Abgleich · {fertig} von {zeilen.length} verknüpft
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Je Kunde den passenden sevDesk-Kontakt wählen und bestätigen. Kein Treffer? Suchbegriff kürzen
          (z. B. ohne „GmbH") und erneut suchen. Die Rechnungsadresse wird aus sevDesk übernommen.
        </p>
        <div className="space-y-2">
          {zeilen.map((z) => (
            <div key={z.client.id} className="border border-border rounded p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-foreground truncate">{z.client.name}</p>
                {z.status === 'verknuepft' && (
                  <span className="text-xs text-emerald-700 flex items-center gap-1 shrink-0"><Check className="w-3.5 h-3.5" /> verknüpft</span>
                )}
                {(z.status === 'laedt' || z.status === 'wartet') && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> {z.status === 'wartet' ? 'wartet' : 'sucht in sevDesk'}
                  </span>
                )}
              </div>
              {z.status !== 'verknuepft' && (
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1.4fr_auto] gap-2 items-center">
                  <Input className="h-8 text-xs" value={z.begriff} onChange={(e) => setze(z.client.id, { begriff: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && z.begriff.trim() && suche(z.client, z.begriff.trim())} />
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1 rounded"
                    disabled={z.status === 'laedt' || !z.begriff.trim()} onClick={() => suche(z.client, z.begriff.trim())}>
                    <Search className="w-3.5 h-3.5" /> Suchen
                  </Button>
                  <select className="h-8 text-xs border border-input rounded px-2 bg-white min-w-0" value={z.wahl}
                    onChange={(e) => setze(z.client.id, { wahl: e.target.value })}>
                    <option value="">{z.treffer.length ? `— ${z.treffer.length} Treffer, bitte wählen —` : '— kein Treffer —'}</option>
                    {z.treffer.map((k) => (
                      <option key={k.sevdesk_contact_id} value={k.sevdesk_contact_id}>
                        {k.name}{k.customer_number ? ` · Nr. ${k.customer_number}` : ''}{k.city ? ` · ${k.city}` : ''}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" className="h-8 text-xs gap-1 rounded" disabled={!z.wahl || z.status !== 'bereit'} onClick={() => verknuepfen(z)}>
                    <Link2 className="w-3.5 h-3.5" /> {z.status === 'speichert' ? 'Speichert…' : 'Verknüpfen'}
                  </Button>
                </div>
              )}
              {z.fehler && <p className="text-xs text-destructive">{z.fehler}</p>}
            </div>
          ))}
          {zeilen.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Alle Kunden sind mit sevDesk verknüpft.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded" onClick={schliessen}>Schließen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
