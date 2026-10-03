import React, { useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Search, Plus } from 'lucide-react';

const norm = (s) => String(s || '').toLowerCase();

// Kundenwahl mit Tippsuche — ersetzt das lange Auswahlfeld. Sucht in Name,
// Ansprechperson und sevDesk-Nummer. „neuer Kunde" steht immer oben.
export default function KundenAuswahl({ clients = [], value, onChange, neuWert, placeholder = 'Kunde suchen …' }) {
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState('');
  const zu = useRef(null);
  const gewaehlt = clients.find((c) => c.id === value);

  const treffer = useMemo(() => {
    const q = norm(text).trim();
    const liste = q
      ? clients.filter((c) => [c.name, c.contact_person, c.sevdesk_contact_id].some((f) => norm(f).includes(q)))
      : clients;
    return liste.slice(0, 30);
  }, [clients, text]);

  const waehlen = (id) => {
    onChange(id);
    setText('');
    setOffen(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-muted-foreground" />
        <Input
          className="pl-8"
          value={offen ? text : (value === neuWert ? '＋ neuer Kunde' : gewaehlt?.name || '')}
          placeholder={placeholder}
          onChange={(e) => { setText(e.target.value); setOffen(true); }}
          onFocus={() => { clearTimeout(zu.current); setText(''); setOffen(true); }}
          onBlur={() => { zu.current = setTimeout(() => setOffen(false), 150); }}
        />
      </div>
      {offen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-border rounded shadow-sm max-h-64 overflow-y-auto">
          {neuWert && (
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => waehlen(neuWert)}
              className="w-full text-left text-sm px-3 py-2 hover:bg-muted flex items-center gap-1.5 border-b border-border">
              <Plus className="w-3.5 h-3.5" /> neuer Kunde
            </button>
          )}
          {treffer.map((c) => (
            <button key={c.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => waehlen(c.id)}
              className="w-full text-left text-sm px-3 py-2 hover:bg-muted flex items-center justify-between gap-2">
              <span className="truncate">{c.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {c.sevdesk_contact_id ? `sevDesk ${c.sevdesk_contact_id}` : 'ohne sevDesk'}
              </span>
            </button>
          ))}
          {treffer.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Kein Kunde gefunden — oben „neuer Kunde" wählen.</p>
          )}
        </div>
      )}
    </div>
  );
}
