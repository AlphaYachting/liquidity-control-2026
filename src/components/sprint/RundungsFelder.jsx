import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { beispielSatz } from '@/lib/zeit/rundung';

// Abschnitt "Abrechnung und Rundung" der Projektmaske — die Folge der Einstellung steht darunter.
export default function RundungsFelder({ form, setForm }) {
  const setzen = (feld, wert) => setForm((f) => ({ ...f, [feld]: wert }));
  const regeln = {
    rundung_minuten: form.rundung_minuten ?? 0,
    rundung_art: form.rundung_art || 'auf',
    rundung_basis: form.rundung_basis || 'tag_projekt',
    mindestbuchung_minuten: form.mindestbuchung_minuten ?? 0,
  };

  return (
    <div className="space-y-3 pt-3 border-t">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Abrechnung und Rundung</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Rundung</Label>
          <Select value={String(regeln.rundung_minuten)} onValueChange={(v) => setzen('rundung_minuten', Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">keine Rundung</SelectItem>
              <SelectItem value="15">15 Minuten</SelectItem>
              <SelectItem value="30">30 Minuten</SelectItem>
              <SelectItem value="60">60 Minuten</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Art</Label>
          <Select value={regeln.rundung_art} onValueChange={(v) => setzen('rundung_art', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auf">aufrunden</SelectItem>
              <SelectItem value="kaufmaennisch">kaufmännisch</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Basis</Label>
          <Select value={regeln.rundung_basis} onValueChange={(v) => setzen('rundung_basis', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="buchung">je Buchung</SelectItem>
              <SelectItem value="tag_projekt">je Tag und Projekt</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Mindestbuchung (Minuten)</Label>
          <Input type="number" min="0" value={regeln.mindestbuchung_minuten}
            onChange={(e) => setzen('mindestbuchung_minuten', Number(e.target.value) || 0)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{beispielSatz(regeln)}</p>
    </div>
  );
}