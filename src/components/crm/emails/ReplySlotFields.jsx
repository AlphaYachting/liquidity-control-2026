import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Eingabe der vom Menschen vorgegebenen Terminslots — es wird nichts abgeleitet oder erfunden.
export default function ReplySlotFields({ slots, onSlotChange, format, onFormatChange, disabled }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {slots.map((value, i) => (
          <div key={i}>
            <Label className="text-[10px] text-muted-foreground">Terminvorschlag {i + 1}</Label>
            <Input
              type="datetime-local"
              value={value}
              disabled={disabled}
              onChange={(e) => onSlotChange(i, e.target.value)}
              className="mt-1 h-8 text-xs"
            />
          </div>
        ))}
      </div>
      <div className="w-full sm:w-56">
        <Label className="text-[10px] text-muted-foreground">Format</Label>
        <Select value={format} onValueChange={onFormatChange} disabled={disabled}>
          <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="vor_ort">Vor Ort</SelectItem>
            <SelectItem value="telefon">Telefonisch</SelectItem>
            <SelectItem value="video">Videocall</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}