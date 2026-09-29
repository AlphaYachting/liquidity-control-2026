import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { RHYTHMUS_LABEL } from './paketZaehler';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const anzeige = (s) => {
  const d = new Date(`${s}T00:00:00`);
  return `ab ${d.toLocaleDateString('de-AT', { weekday: 'short' }).replace('.', '')} ${d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}.`;
};

export default function RoutineVorlageZeile({ vorlage, an, termin, onToggle, onTermin }) {
  const [offen, setOffen] = useState(false);
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <Checkbox checked={an} onCheckedChange={onToggle} />
      <RefreshCw className="text-muted-foreground shrink-0" style={{ width: 12, height: 12 }} />
      <span className="flex-1 min-w-0 truncate">{vorlage.title}</span>
      <span className="text-xs border border-border rounded px-1.5 text-muted-foreground">{RHYTHMUS_LABEL[vorlage.rhythmus] || 'manuell'}</span>
      <Popover open={offen} onOpenChange={setOffen}>
        <PopoverTrigger asChild disabled={!an}>
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground w-24 text-right disabled:opacity-50">
            {termin ? anzeige(termin) : 'Termin wählen'}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={termin ? new Date(`${termin}T00:00:00`) : undefined}
            onSelect={(d) => { setOffen(false); onTermin(d ? iso(d) : null); }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}