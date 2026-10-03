import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const NEU = '__neu__';

// Projekt-Cockpit: neu anlegen oder ein freies Cockpit dieses Kunden übernehmen.
// value = '' bedeutet „Neu anlegen".
export default function CockpitAuswahl({ customer, value, onChange }) {
  // Belegt ist ein Cockpit auch dann, wenn ein Projekt über liquidity_project_id
  // darauf zeigt, ohne dass project_ref_id gesetzt ist — beide Richtungen prüfen.
  const { data: belegteIds } = useQuery({
    queryKey: ['belegteCockpitIds'],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const projekte = await base44.entities.Project.filter({}, 'id', 1000);
      return new Set(projekte.map((p) => p.liquidity_project_id).filter(Boolean));
    },
  });

  const { data: cockpits = [] } = useQuery({
    queryKey: ['freieCockpits', customer, belegteIds ? belegteIds.size : -1],
    enabled: !!customer && !!belegteIds,
    queryFn: async () => {
      const rows = await base44.entities.LiquidityProject.filter({ customer }, 'project_name', 200);
      return rows.filter(
        (c) => c.status !== 'cancelled' && !c.project_ref_id && !belegteIds.has(c.id)
      );
    },
  });

  return (
    <div>
      <Label>Projekt-Cockpit</Label>
      <Select value={value || NEU} onValueChange={(v) => onChange(v === NEU ? '' : v)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NEU}>Neu anlegen</SelectItem>
          {cockpits.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.project_name}{c.order_number ? ` · ${c.order_number}` : ''}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="mt-1 text-xs text-muted-foreground">
        {cockpits.length === 0
          ? 'Keine freien Cockpits für diesen Kunden — es wird eines neu angelegt.'
          : 'Ein bestehendes Cockpit nur wählen, wenn ein laufendes Projekt umzieht.'}
      </p>
    </div>
  );
}