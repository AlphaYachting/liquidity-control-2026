import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { anfrageKurz } from '@/lib/crm/anfrageKurz';
import FeldTitel from './FeldTitel';

// Die Anfrage sitzt über der Karte — verdichtet auf zwei Zeilen.
// Bearbeitet wird immer der vollständige Originaltext.
export default function AnfrageZeile({ deal, onChanged }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(deal.description || '');
  const [busy, setBusy] = useState(false);

  const kurz = anfrageKurz(deal.description);

  const speichern = async () => {
    setBusy(true);
    await base44.entities.CrmDeal.update(deal.id, { description: text });
    setBusy(false);
    setEdit(false);
    onChanged?.();
  };

  return (
    <div className="border-b border-border px-4 py-3 flex gap-3 items-start">
      <div className="min-w-0 flex-1">
        <FeldTitel>Anfrage</FeldTitel>
        {edit ? (
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} className="bg-background text-sm" />
        ) : kurz ? (
          <p className="text-[12.5px] text-muted-foreground line-clamp-2">{kurz}</p>
        ) : (
          <p className="text-[12.5px] text-muted-foreground italic">Noch nicht erfasst</p>
        )}
      </div>
      {edit ? (
        <Button variant="link" size="sm" className="flex-none text-xs text-primary" onClick={speichern} disabled={busy}>
          {busy ? 'Speichert…' : 'Speichern'}
        </Button>
      ) : (
        <Button
          variant="link"
          size="sm"
          className="flex-none text-xs text-primary"
          onClick={() => { setText(deal.description || ''); setEdit(true); }}
        >
          {deal.description ? 'Bearbeiten' : 'Erfassen'}
        </Button>
      )}
    </div>
  );
}