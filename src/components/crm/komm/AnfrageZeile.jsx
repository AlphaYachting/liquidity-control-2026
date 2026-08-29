import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import FeldTitel from './FeldTitel';

// Die Anfrage sitzt über der Karte — zwei Zeilen genügen, der Rest ist eine Bearbeitung.
export default function AnfrageZeile({ deal, onChanged }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(deal.description || '');
  const [busy, setBusy] = useState(false);

  const speichern = async () => {
    setBusy(true);
    await base44.entities.CrmDeal.update(deal.id, { description: text });
    setBusy(false);
    setEdit(false);
    onChanged?.();
  };

  return (
    <div className="bg-muted/40 border-b border-border px-4 py-3 flex gap-3 items-start">
      <div className="min-w-0 flex-1">
        <FeldTitel>Anfrage</FeldTitel>
        {edit ? (
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} className="bg-background text-sm" />
        ) : deal.description ? (
          <p className="text-[12.5px] text-muted-foreground whitespace-pre-wrap line-clamp-2">{deal.description}</p>
        ) : (
          <p className="text-[12.5px] text-muted-foreground italic">Noch nicht erfasst</p>
        )}
      </div>
      {edit ? (
        <Button variant="ghost" size="sm" className="flex-none" onClick={speichern} disabled={busy}>
          {busy ? 'Speichert…' : 'Speichern'}
        </Button>
      ) : (
        <Button variant="ghost" size="sm" className="flex-none" onClick={() => { setText(deal.description || ''); setEdit(true); }}>
          {deal.description ? 'Bearbeiten' : 'Erfassen'}
        </Button>
      )}
    </div>
  );
}