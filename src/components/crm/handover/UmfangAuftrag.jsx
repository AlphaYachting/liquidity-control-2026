import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import ListenFeld from '@/components/crm/handover/ListenFeld';

const Feld = ({ label, hinweis, children }) => (
  <div className="space-y-1">
    <p className="text-[11px] text-muted-foreground">{label}{hinweis && <span className="ml-1 text-status-attention">· {hinweis}</span>}</p>
    {children}
  </div>
);

// Auftragsrahmen: gilt für den ganzen Auftrag
export default function UmfangAuftrag({ a, onChange }) {
  const set = (patch) => onChange({ ...a, ...patch });
  return (
    <div className="px-3 py-3 space-y-3">
      <Feld label="Leistungszeitraum">
        <Textarea value={a.leistungszeitraum} onChange={(e) => set({ leistungszeitraum: e.target.value })} rows={3} className="text-sm" />
      </Feld>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Feld label="Liefertermin">
          <Input type="date" value={a.liefertermin} onChange={(e) => set({ liefertermin: e.target.value })} className="h-8 text-sm" />
        </Feld>
        <Feld label="Korrekturschleifen je Leistungspaket" hinweis={a.schleifenStandard ? 'Standard laut Konditionen' : null}>
          <Input type="number" min="0" value={a.korrekturschleifen}
            onChange={(e) => set({ korrekturschleifen: e.target.value, schleifenStandard: false })} className="h-8 text-sm" />
        </Feld>
      </div>
      <Feld label="Mehrkostenregel">
        <Textarea value={a.mehrkosten_regel} onChange={(e) => set({ mehrkosten_regel: e.target.value })} rows={2} className="text-sm" />
      </Feld>
      <Feld label="Nicht enthalten (eine Zeile je Leistung)">
        <ListenFeld value={a.nicht_enthalten} onChange={(v) => set({ nicht_enthalten: v })} />
      </Feld>
    </div>
  );
}