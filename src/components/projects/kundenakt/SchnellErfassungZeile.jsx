import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Sparkles, Save } from 'lucide-react';

// Einzeiliger Einstieg in den Kundenakt — festhalten oder erst ordnen lassen.
export default function SchnellErfassungZeile({ onFesthalten, onStrukturieren }) {
  const [text, setText] = useState('');
  const leer = !text.trim();

  const uebergeben = (fn) => { fn(text.trim()); setText(''); };

  return (
    <div className="flex items-center gap-2">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !leer) uebergeben(onFesthalten); }}
        placeholder="Was ist passiert?"
        className="h-8 text-sm bg-background"
      />
      <Button size="sm" variant="outline" disabled={leer} className="h-8 text-xs gap-1.5 shrink-0"
        onClick={() => uebergeben(onFesthalten)}>
        <Save className="w-3.5 h-3.5" /> Festhalten
      </Button>
      <Button size="sm" variant="outline" disabled={leer} className="h-8 text-xs gap-1.5 shrink-0"
        onClick={() => uebergeben(onStrukturieren)}>
        <Sparkles className="w-3.5 h-3.5" /> Strukturieren
      </Button>
    </div>
  );
}