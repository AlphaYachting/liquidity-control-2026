import React from 'react';
import { Textarea } from '@/components/ui/textarea';

// Liste als mehrzeiliges Feld: eine Zeile je Eintrag. Leere Zeilen fallen erst beim Speichern weg.
export default function ListenFeld({ value = [], onChange, placeholder, rows = 3 }) {
  return (
    <Textarea
      value={(value || []).join('\n')}
      onChange={(e) => onChange(e.target.value.split('\n'))}
      placeholder={placeholder}
      rows={Math.max(rows, Math.min((value || []).length + 1, 10))}
      className="text-sm"
    />
  );
}