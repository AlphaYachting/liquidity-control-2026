import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import SectionLabel from '@/components/sprint/SectionLabel';
import FreigabeCheckliste from '@/components/sprint/FreigabeCheckliste';
import LieferstandFeld from '@/components/sprint/LieferstandFeld';
import { freigabeVoraussetzungen } from '@/lib/sprint/freigabe';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';

// X3 — Der einzige Weg in den Zustand "freigegeben". Ein Zurück gibt es nicht.
export default function FreigabePanel({ milestone, tickets, notifications, feedbacks, onLinksChange, onFreigeben }) {
  const [source, setSource] = useState('');
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);

  const items = freigabeVoraussetzungen({ milestone, tickets, notifications, feedbacks, source });
  const blocker = items.find((i) => i.blocking && !i.ok);
  const warnung = items.find((i) => !i.blocking && !i.ok);

  const freigeben = async () => {
    setBusy(true);
    await onFreigeben(source.trim());
    setBusy(false);
    setAsk(false);
  };

  return (
    <div className="bg-white rounded-lg border border-[#e0e0e0] p-5 space-y-4">
      <SectionLabel>Voraussetzungen für die Freigabe</SectionLabel>
      <FreigabeCheckliste items={items} />

      <LieferstandFeld
        links={milestone.deliverable_links || []}
        onChange={onLinksChange}
      />

      <div>
        <p className="text-[13px] mb-1" style={{ color: RITTLER.textSecondary }}>Freigabequelle</p>
        <Input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="z. B. Freigabe per Mail von Frau Muster am 12.08."
          className="rounded"
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
          className="bg-[#ff3764] hover:bg-[#d12d52] text-white font-bold uppercase rounded"
          onClick={() => setAsk(true)}
        >
          <Lock className="w-4 h-4" /> Etappe freigeben
        </Button>
        {blocker && (
          <p className="text-sm mt-2" style={{ color: RITTLER.textSecondary }}>
            Noch offen: {blocker.text}.
          </p>
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
            <Button variant="outline" className="rounded border-[1.5px] border-[#2d2d2d] text-[#2d2d2d]" onClick={() => setAsk(false)}>
              Abbrechen
            </Button>
            <Button
              disabled={busy}
              className="bg-[#ff3764] hover:bg-[#d12d52] text-white font-bold uppercase rounded"
              onClick={freigeben}
            >
              Endgültig freigeben
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}