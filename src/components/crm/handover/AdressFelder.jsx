import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Rechnungsadresse des Kunden — wird am Kunden gespeichert und nach sevDesk geschrieben.
export default function AdressFelder({ werte, onChange }) {
  const feld = (key, value) => onChange({ ...werte, [key]: value });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
      <div className="sm:col-span-2">
        <Label className="text-xs">Straße + Nr.</Label>
        <Input className="h-8 text-sm" value={werte.street || ''} onChange={(e) => feld('street', e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">PLZ</Label>
        <Input className="h-8 text-sm" value={werte.zip || ''} onChange={(e) => feld('zip', e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Ort</Label>
        <Input className="h-8 text-sm" value={werte.city || ''} onChange={(e) => feld('city', e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Land</Label>
        <Input className="h-8 text-sm" value={werte.country_code || ''} onChange={(e) => feld('country_code', e.target.value.toUpperCase())} />
      </div>
    </div>
  );
}