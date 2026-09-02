import React, { useState } from 'react';
import { History } from 'lucide-react';
import ActivityComposer from '@/components/crm/ActivityComposer';
import ActivityTimeline from '@/components/crm/ActivityTimeline';

const GESPRAECH = ['call', 'email', 'meeting', 'note'];

// Erfassen und Verlauf in EINEM Kasten — eine Sache, ein Rahmen.
export default function DealVerlauf({ dealId, activities = [], onChanged }) {
  const [filter, setFilter] = useState('gespraeche');
  const [limit, setLimit] = useState(30);

  const liste = filter === 'gespraeche' ? activities.filter((a) => GESPRAECH.includes(a.activity_type)) : activities;
  const sichtbar = liste.slice(0, limit);

  const knopf = (key, label) => (
    <button
      type="button"
      onClick={() => { setFilter(key); setLimit(30); }}
      className={`h-[26px] px-2.5 text-[11.5px] border-0 transition-colors duration-[120ms] ${
        filter === key ? 'bg-foreground text-background font-semibold' : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="border border-border rounded-lg bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <History className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">Verlauf</span>
        <div className="ml-auto inline-flex border border-input rounded-sm overflow-hidden">
          <span className="border-r border-input inline-flex">{knopf('gespraeche', 'Nur Gespräche')}</span>
          {knopf('alles', 'Alles')}
        </div>
      </div>

      <div className="p-4">
        <div className="border-b border-border pb-4 mb-4">
          <ActivityComposer dealId={dealId} onAdded={onChanged} bare />
        </div>

        <ActivityTimeline activities={sichtbar} onChanged={onChanged} />

        {liste.length > sichtbar.length && (
          <button
            type="button"
            onClick={() => setLimit((l) => l + 30)}
            className="mt-2 text-xs text-primary hover:underline"
          >
            weitere anzeigen ({liste.length - sichtbar.length})
          </button>
        )}
      </div>
    </div>
  );
}