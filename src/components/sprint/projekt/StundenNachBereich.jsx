import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { laufenderMonat, monatsName, stundenVon, imMonat, h1 } from '@/lib/sprint/behaelterZahlen';

// Zeile „Stunden {Monat} nach Leistungsbereich“
export default function StundenNachBereich({ timeEntries }) {
  const monat = laufenderMonat();
  const eintraege = imMonat(timeEntries, monat);
  const ids = [...new Set(eintraege.map((e) => e.module_template_id).filter(Boolean))];
  const { data: module = [] } = useQuery({
    queryKey: ['stundenBereichModule', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: () => base44.entities.ModuleTemplate.filter({ id: { $in: ids } }, 'name', 200),
  });
  const summen = {};
  for (const e of eintraege) {
    const k = e.module_template_id || '';
    summen[k] = (summen[k] || 0) + stundenVon(e);
  }
  const teile = Object.entries(summen)
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : 0))
    .map(([k, v]) => `${k ? (module.find((m) => m.id === k)?.name || 'Bereich') : 'ohne Bereich'} ${h1(v)} h`);

  return (
    <div className="bg-white rounded-lg border border-border px-5 py-3 text-sm">
      <span className="text-muted-foreground">Stunden {monatsName(monat)} nach Leistungsbereich: </span>
      <span className="text-foreground">{teile.length ? teile.join(' · ') : 'noch keine Buchungen'}</span>
    </div>
  );
}