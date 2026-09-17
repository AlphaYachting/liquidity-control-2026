import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

// Seitenkopf — Modulnamen in Versalien, Objektnamen mit versalien={false}.
export default function Seitenkopf({ bereich, titel, versalien = true, kontext, aktionen, zurueck }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-2">
      <div className="min-w-0 space-y-0.5">
        {zurueck && (
          <Link to={zurueck.to} className="inline-flex items-center gap-1.5 text-meta text-muted-foreground hover:text-foreground mb-1">
            <ArrowLeft className="w-3.5 h-3.5" />{zurueck.label}
          </Link>
        )}
        {bereich && <p className="text-label uppercase text-muted-foreground">{bereich}</p>}
        <h1 className={cn('text-page text-foreground', versalien && 'uppercase')}>{titel}</h1>
        {kontext && (
          <div className="text-meta text-muted-foreground truncate" title={typeof kontext === 'string' ? kontext : undefined}>
            {kontext}
          </div>
        )}
      </div>
      {aktionen && <div className="flex items-center gap-2 shrink-0 flex-wrap">{aktionen}</div>}
    </div>
  );
}