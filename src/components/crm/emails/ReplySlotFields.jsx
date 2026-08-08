import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, X } from 'lucide-react';

const dayLabel = (iso) =>
  iso ? new Date(iso).toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' }) : 'Datum wählen';

// Terminslots per Kalender wählen (Datum im Kalender, Uhrzeit daneben).
// Werte werden als "YYYY-MM-DDTHH:mm" geführt — identisch zum bisherigen Format.
export default function ReplySlotFields({ slots, onSlotChange, format, onFormatChange, disabled }) {
  const parse = (v) => ({ date: v ? v.slice(0, 10) : '', time: v ? v.slice(11, 16) : '' });

  const setDate = (i, d) => {
    if (!d) return;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    onSlotChange(i, `${iso}T${parse(slots[i]).time || '10:00'}`);
  };
  const setTime = (i, t) => {
    const { date } = parse(slots[i]);
    if (!date) return;
    onSlotChange(i, `${date}T${t || '10:00'}`);
  };

  return (
    <div className="space-y-2">
      {slots.map((value, i) => {
        const { date, time } = parse(value);
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-4 shrink-0">{i + 1}.</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" disabled={disabled} className="h-8 text-xs gap-1.5 flex-1 justify-start font-normal">
                  <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                  {date ? dayLabel(value) : <span className="text-muted-foreground">Datum wählen</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date ? new Date(`${date}T00:00`) : undefined}
                  onSelect={(d) => setDate(i, d)}
                  weekStartsOn={1}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Input
              type="time"
              value={time}
              disabled={disabled || !date}
              onChange={(e) => setTime(i, e.target.value)}
              className="h-8 w-24 text-xs"
            />
            {value && (
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={disabled} onClick={() => onSlotChange(i, '')}>
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            )}
          </div>
        );
      })}
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