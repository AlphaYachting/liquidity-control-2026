import React from 'react';
import { ExternalLink } from 'lucide-react';
import { abLinks } from '@/lib/crm/abStatus';

// Links zu Angebot, AB in sevDesk und AB-PDF — nur, was befüllt ist
export default function AbLinks({ order }) {
  const links = abLinks(order);
  if (!links.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {links.map((l) => (
        <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-input bg-card text-xs hover:bg-muted/60">
          <ExternalLink className="w-3 h-3" /> {l.label}
        </a>
      ))}
    </div>
  );
}