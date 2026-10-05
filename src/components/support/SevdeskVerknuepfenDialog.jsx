import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search } from 'lucide-react';

// Kunden der App mit seinem sevDesk-Kontakt verknüpfen — ohne Umweg ins Kundenverzeichnis.
// Vorhandene Adressdaten des Kunden bleiben unverändert, nur Leeres wird ergänzt.
export default function SevdeskVerknuepfenDialog({ clientId, kundenname, open, onOpenChange, onDone }) {
  const [suche, setSuche] = useState(kundenname || '');
  const [treffer, setTreffer] = useState([]);
  const [gesucht, setGesucht] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');

  const suchen = async () => {
    setBusy(true);
    setFehler('');
    try {
      const res = await base44.functions.invoke('fetchSevdeskContacts', { query: suche });
      setTreffer(res.data?.contacts || []);
      setGesucht(true);
      if (res.data?.error) setFehler(res.data.error);
    } catch (e) {
      setFehler(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  const verknuepfen = async (kontakt) => {
    setBusy(true);
    setFehler('');
    try {
      const res = await base44.functions.invoke('supportVerrechnung', { aktion: 'sevdesk_verknuepfen', client_id: clientId, kontakt });
      if (res.data?.error) throw new Error(res.data.error);
      onDone();
      onOpenChange(false);
    } catch (e) {
      setFehler(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Mit sevDesk verknüpfen — {kundenname}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Kontakt in sevDesk suchen</Label>
            <div className="flex gap-2 mt-1">
              <Input value={suche} onChange={(e) => setSuche(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && suchen()} placeholder="Firmenname" />
              <Button variant="outline" onClick={suchen} disabled={busy || !suche.trim()}>
                <Search className="w-3.5 h-3.5" /> Suchen
              </Button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto border rounded-lg divide-y">
            {treffer.map((k) => (
              <button
                key={k.sevdesk_contact_id}
                onClick={() => verknuepfen(k)}
                disabled={busy}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between gap-3"
              >
                <span className="min-w-0">
                  <span className="block truncate">{k.name}</span>
                  {(k.street || k.city) && <span className="block text-xs text-muted-foreground truncate">{[k.street, [k.zip, k.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</span>}
                </span>
                <span className="text-xs text-muted-foreground flex-shrink-0">{k.customer_number || '—'}</span>
              </button>
            ))}
            {gesucht && treffer.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">Kein Kontakt gefunden — bitte anderen Suchbegriff versuchen.</p>}
            {!gesucht && <p className="px-3 py-3 text-xs text-muted-foreground">Suchbegriff prüfen und suchen.</p>}
          </div>
          {fehler && <p className="text-xs text-red-600">{fehler}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
