import React from 'react';
import InboxItemCard from '@/components/crm/InboxItemCard';

// Eine Spur des Posteingangs — Leads bzw. Support/Störungen.
export default function InboxLane({ titel, symbol: Symbol, hinweis, items, onConvert, onAssign, onChanged }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {Symbol && <Symbol className="w-4 h-4 text-muted-foreground" />}
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {titel} ({items.length})
        </p>
      </div>
      {items.length === 0 ? (
        <div className="border border-dashed rounded-xl p-6 text-center">
          <p className="text-xs text-muted-foreground">{hinweis}</p>
        </div>
      ) : (
        items.map(item => (
          <InboxItemCard key={item.id} item={item}
            onConvert={onConvert} onAssign={onAssign} onChanged={onChanged} />
        ))
      )}
    </div>
  );
}