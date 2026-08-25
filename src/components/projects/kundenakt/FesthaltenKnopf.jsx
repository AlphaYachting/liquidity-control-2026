import React from 'react';
import { Button } from '@/components/ui/button';
import { PenLine } from 'lucide-react';

// Einstieg zum Festhalten eines Projektupdates — öffnet die Projektintelligenz
// direkt im Erfassungsmodus. Steht in der Kontextzone und gilt für alle Reiter.
export default function FesthaltenKnopf({ onFesthalten }) {
  return (
    <Button size="sm" variant="outline" className="gap-2 shrink-0" onClick={onFesthalten}>
      <PenLine className="w-3.5 h-3.5" /> Festhalten
    </Button>
  );
}