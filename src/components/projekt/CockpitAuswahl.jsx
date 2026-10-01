import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const NEU = '__neu__';

// Projekt-Cockpit: neu anlegen oder ein freies Cockpit dieses Kunden übernehmen.
// value = '' bedeutet „Neu anlegen".
export default function CockpitAuswahl({ customer, value, onChange }) {
  const { data: cockpits = [] } = useQuery({
    queryKey: ['freieCockpits', customer],
    enabled: !!customer,
    queryFn: async () => {
      const rows = await base44.entities.LiquidityProject.filter({ customer }, 'project_name', 200);
      return rows.filter((c) => c.status !== 'cancelled' && !c.project_ref_id);
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
        Ein bestehendes Cockpit nur wählen, wenn ein laufendes Projekt umzieht.
      </p>
    </div>
  );
}