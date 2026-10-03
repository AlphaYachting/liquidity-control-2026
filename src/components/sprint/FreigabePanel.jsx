import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import FreigabeCheckliste from '@/components/sprint/FreigabeCheckliste';
import LieferstandFeld from '@/components/sprint/LieferstandFeld';
import { freigabeVoraussetzungen } from '@/lib/sprint/freigabe';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';

// X3 — Der einzige Weg in den Zustand "freigegeben". Ein Zurück gibt es nicht.
export default function FreigabePanel({ milestone, tickets, notifications, feedbacks, onLinksChange, onFreigeben }) {
  const [source, setSource] = useState('');
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');

  const items = freigabeVoraussetzungen({ milestone, tickets, notifications, feedbacks, source });
  const blocker = items.find((i) => i.blocking && !i.ok);
  const warnung = items.find((i) => !i.blocking && !i.ok);

  const freigeben = async () => {
    setBusy(true);
    const res = await onFreigeben(source.trim());
    setBusy(false);
    setAsk(false);
    setServerError(res && res.ok === false ? res.error : '');
  };

  return (
    <section className="bg-card rounded border border-border px-5 py-[18px] space-y-4">
      <h2 className="m-0 text-section uppercase text-muted-foreground">Freigabe</h2>
      <FreigabeCheckliste items={items} />

      <LieferstandFeld
        links={milestone.deliverable_links || []}
        onChange={onLinksChange}
      />

      <div>
        <label htmlFor="freigabe-quelle" className="block text-xs font-medium text-[#555555] mb-1">Freigabequelle</label>
        <Input
          id="freigabe-quelle"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="z. B. Freigabe per Mail von Frau Muster am 12.08."
          className="rounded max-w-[520px]"
        />
      </div>

      {warnung && (
        <p className="text-sm" style={{ color: STATUS_COLORS.attention }}>
          {warnung.text} — {warnung.hint}. Die Freigabe ist trotzdem möglich.
        </p>
      )}

      <div>
        <Button
          disabled={!!blocker}
          className="h-[38px] rounded bg-foreground px-4 text-sm font-semibold text-white hover:bg-foreground/90"
          onClick={() => setAsk(true)}
        >
          <Lock className="w-4 h-4" /> Etappe freigeben
        </Button>
        {blocker && (
          <p className="text-sm mt-2" style={{ color: RITTLER.textSecondary }}>
            Noch offen: {blocker.text}.
          </p>
        )}
        {serverError && (
          <p className="text-sm mt-2" style={{ color: STATUS_COLORS.critical }}>{serverError}</p>
        )}
      </div>

      <Dialog open={ask} onOpenChange={setAsk}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{milestone.title} freigeben</DialogTitle>
            <DialogDescription>
              Diese Etappe wird endgültig geschlossen und abgerechnet. Ein Zurück gibt es nicht.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="rounded border-[1.5px] border-foreground text-foreground" onClick={() => setAsk(false)}>
              Abbrechen
            </Button>
            <Button
              disabled={busy}
              className="bg-primary hover:bg-primary/90 text-white font-bold uppercase rounded"
              onClick={freigeben}
            >
              Endgültig freigeben
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}