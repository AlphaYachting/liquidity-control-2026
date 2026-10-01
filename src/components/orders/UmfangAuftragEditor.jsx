import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import ListenFeld from '@/components/crm/handover/ListenFeld';
import { fmtTag } from '@/lib/crm/abStatus';

const FELDER = ['angebot_url', 'angebot_nummer', 'angebot_datum', 'leistungszeitraum', 'liefertermin', 'korrekturschleifen', 'mehrkosten_regel', 'nicht_enthalten'];
const auswahl = (o) => Object.fromEntries(FELDER.map((k) => [k, o[k] ?? (k === 'nicht_enthalten' ? [] : '')]));

const Feld = ({ label, children }) => <div><p className="text-xs text-muted-foreground mb-1">{label}</p>{children}</div>;
const Zeile = ({ label, wert }) => <div className="flex justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="text-right break-words">{wert || '—'}</span></div>;

// Vereinbarter Umfang der AB — inline anzeigen und bearbeiten
export default function UmfangAuftragEditor({ order }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState(auswahl(order));
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: () => base44.entities.ConfirmedOrder.update(order.id, {
      ...f,
      korrekturschleifen: f.korrekturschleifen === '' ? null : Number(f.korrekturschleifen),
      angebot_datum: f.angebot_datum || null, liefertermin: f.liefertermin || null,
      nicht_enthalten: (f.nicht_enthalten || []).map((s) => s.trim()).filter(Boolean),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['confirmedOrders'] }); qc.invalidateQueries({ queryKey: ['projektAbrechnung'] }); setEdit(false); },
  });

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Vereinbarter Umfang</p>
        {!edit && <Button size="sm" variant="outline" onClick={() => { setF(auswahl(order)); setEdit(true); }}>Bearbeiten</Button>}
      </div>
      {!edit ? (
        <div className="space-y-1.5">
          <Zeile label="Angebot" wert={order.angebot_url ? <a href={order.angebot_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{order.angebot_nummer || 'öffnen'}</a> : order.angebot_nummer} />
          <Zeile label="Angebotsdatum" wert={fmtTag(order.angebot_datum)} />
          <Zeile label="Leistungszeitraum" wert={order.leistungszeitraum} />
          <Zeile label="Liefertermin" wert={fmtTag(order.liefertermin)} />
          <Zeile label="Korrekturschleifen" wert={order.korrekturschleifen} />
          <Zeile label="Mehraufwand" wert={order.mehrkosten_regel} />
          <div><p className="text-muted-foreground">Nicht enthalten</p>
            {order.nicht_enthalten?.length ? <ul className="list-disc pl-5 text-meta">{order.nicht_enthalten.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p>—</p>}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Feld label="Angebot-Link"><Input value={f.angebot_url} onChange={(e) => set('angebot_url', e.target.value)} /></Feld>
          <div className="grid grid-cols-2 gap-2">
            <Feld label="Angebotsnummer"><Input value={f.angebot_nummer} onChange={(e) => set('angebot_nummer', e.target.value)} /></Feld>
            <Feld label="Angebotsdatum"><Input type="date" value={f.angebot_datum} onChange={(e) => set('angebot_datum', e.target.value)} /></Feld>
            <Feld label="Liefertermin"><Input type="date" value={f.liefertermin} onChange={(e) => set('liefertermin', e.target.value)} /></Feld>
            <Feld label="Korrekturschleifen"><Input type="number" value={f.korrekturschleifen} onChange={(e) => set('korrekturschleifen', e.target.value)} /></Feld>
          </div>
          <Feld label="Leistungszeitraum"><Input value={f.leistungszeitraum} onChange={(e) => set('leistungszeitraum', e.target.value)} /></Feld>
          <Feld label="Mehraufwand"><Textarea rows={2} value={f.mehrkosten_regel} onChange={(e) => set('mehrkosten_regel', e.target.value)} /></Feld>
          <Feld label="Nicht enthalten (eine Zeile je Eintrag)"><ListenFeld value={f.nicht_enthalten} onChange={(v) => set('nicht_enthalten', v)} /></Feld>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Speichert…' : 'Speichern'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setEdit(false)}>Abbrechen</Button>
          </div>
        </div>
      )}
    </div>
  );
}