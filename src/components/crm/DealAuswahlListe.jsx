import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { STAGE_LABELS } from '@/components/crm/stages';

// Durchsuchbare Deal-Liste mit unterscheidenden Merkmalen (Kontakt, E-Mail, Phase, Datum),
// damit gleichnamige Deals eindeutig auseinanderzuhalten sind.
export default function DealAuswahlListe({ deals, value, onChange, disabled }) {
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const treffer = deals.filter(d => !s || [d.title, d.company_name, d.contact_name, d.contact_email]
    .some(v => String(v || '').toLowerCase().includes(s)));

  return (
    <div className="space-y-2">
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Titel, Firma, Kontakt oder E-Mail suchen" disabled={disabled} />
      <div className="max-h-72 overflow-y-auto border rounded-lg divide-y">
        {treffer.length === 0 && <p className="text-meta text-muted-foreground p-3">Kein Deal gefunden.</p>}
        {treffer.map(d => (
          <button key={d.id} type="button" disabled={disabled} onClick={() => onChange(d.id)}
            className={`w-full text-left px-3 py-2 hover:bg-muted/60 ${value === d.id ? 'bg-muted shadow-[inset_3px_0_0_hsl(var(--primary))]' : ''}`}>
            <p className="text-sm font-medium">{d.title}</p>
            <p className="text-meta text-muted-foreground">
              {[d.company_name, d.contact_name, d.contact_email].filter(Boolean).join(' · ') || 'Keine Kontaktdaten'}
            </p>
            <p className="text-meta text-muted-foreground">
              {STAGE_LABELS?.[d.stage] || d.stage} · angelegt {d.created_date ? new Date(d.created_date).toLocaleDateString('de-AT') : '–'}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}