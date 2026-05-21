import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

export default function FilterBar({ filters, values, onChange, onReset }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-card rounded-xl border">
      {filters.map(f => (
        <Select key={f.key} value={values[f.key] || 'all'} onValueChange={v => onChange(f.key, v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[150px] h-9 text-xs bg-background">
            <SelectValue placeholder={f.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle {f.label}</SelectItem>
            {f.options.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {Object.values(values).some(v => v) && (
        <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={onReset}>
          <X className="w-3 h-3 mr-1" /> Reset
        </Button>
      )}
    </div>
  );
}