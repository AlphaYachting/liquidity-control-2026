import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export const NO_MODULE = 'none';

// Modulwahl je Angebotsposition — offen, bis eine Wahl getroffen ist
export default function PositionModuleSelect({ value, modules, onChange }) {
  return (
    <Select value={value || ''} onValueChange={onChange}>
      <SelectTrigger className={`h-8 text-xs w-56 ${value ? '' : 'border-amber-400 text-amber-700'}`}>
        <SelectValue placeholder="Modul wählen" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_MODULE}>ohne Modul / nach Aufwand</SelectItem>
        {modules.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}