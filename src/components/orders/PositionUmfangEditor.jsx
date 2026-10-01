import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ListenFeld from '@/components/crm/handover/ListenFeld';
import { ABRECHNUNG_LABELS } from '@/lib/crm/abStatus';

const start = (i) => ({
  description: i.description || '', lieferumfang: i.lieferumfang || [],
  korrekturschleifen: i.korrekturschleifen ?? '', leistungszeitraum: i.leistungszeitraum || '', abrechnung: i.abrechnung || 'einmalig',
});

// Umfang einer Position — inline unter der Tabellenzeile
export default function PositionUmfangEditor({ item }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState(start(item));
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: () => base44.entities.ConfirmedOrderItem.update(item.id, {
      ...f,
      korrekturschleifen: f.korrekturschleifen === '' ? null : Number(f.korrekturschleifen),
      lieferumfang: f.lieferumfang.map((s) => s.trim()).filter(Boolean),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['confirmedOrderItems'] }); qc.invalidateQueries({ queryKey: ['orderItems'] }); qc.invalidateQueries({ queryKey: ['projektAbrechnung'] }); setEdit(false); },
  });

  if (!edit) return (
    <div className="space-y-1 text-xs text-muted-foreground">
      {item.description && <p className="whitespace-pre-line">{item.description}</p>}
      {item.lieferumfang?.length > 0 && <ul className="list-disc pl-4">{item.lieferumfang.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      <p>
        Abrechnung: {ABRECHNUNG_LABELS[item.abrechnung] || 'einmalig'}
        {item.korrekturschleifen != null && ` · Korrekturschleifen: ${item.korrekturschleifen}`}
        {item.leistungszeitraum && ` · Dauer: ${item.leistungszeitraum}`}
      </p>
      <button type="button" className="text-primary hover:underline" onClick={() => { setF(start(item)); setEdit(true); }}>Umfang bearbeiten</button>
    </div>
  );

  return (
    <div className="space-y-2 pt-1">
      <Textarea rows={2} placeholder="Beschreibung" value={f.description} onChange={(e) => set('description', e.target.value)} />
      <ListenFeld value={f.lieferumfang} onChange={(v) => set('lieferumfang', v)} placeholder="Lieferumfang – eine Zeile je Eintrag" />
      <div className="grid grid-cols-3 gap-2">
        <Input type="number" placeholder="Korrekturschleifen" value={f.korrekturschleifen} onChange={(e) => set('korrekturschleifen', e.target.value)} />
        <Input placeholder="Dauer / Zeitraum" value={f.leistungszeitraum} onChange={(e) => set('leistungszeitraum', e.target.value)} />
        <Select value={f.abrechnung} onValueChange={(v) => set('abrechnung', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(ABRECHNUNG_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Speichert…' : 'Speichern'}</Button>
        <Button size="sm" variant="ghost" onClick={() => setEdit(false)}>Abbrechen</Button>
      </div>
    </div>
  );
}