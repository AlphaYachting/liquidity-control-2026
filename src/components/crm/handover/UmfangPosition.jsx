import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import PositionModuleSelect from '@/components/crm/handover/PositionModuleSelect';
import ListenFeld from '@/components/crm/handover/ListenFeld';

const Feld = ({ label, children }) => (
  <div className="space-y-1">
    <p className="text-[11px] text-muted-foreground">{label}</p>
    {children}
  </div>
);

// Eine Angebotsposition im Übergabeblatt — alles bearbeitbar, Wortlaut aus dem Angebot vorbelegt
export default function UmfangPosition({ p, modules, onChange, onRemove }) {
  const set = (patch) => onChange({ ...p, ...patch });
  const ohneBeschreibung = p.beauftragt && !p.description.trim();

  return (
    <div className={`px-3 py-3 space-y-3 border-b last:border-b-0 ${p.beauftragt ? '' : 'bg-muted/30'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs">
          <Checkbox checked={p.beauftragt} onCheckedChange={(v) => set({ beauftragt: v === true })} />
          beauftragt
        </label>
        <Input value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder="Leistung" className="h-8 text-sm flex-1 min-w-48" />
        <Input type="number" value={p.amount} onChange={(e) => set({ amount: e.target.value })} className="h-8 text-sm w-28 text-right" placeholder="Betrag" />
        <Select value={p.abrechnung} onValueChange={(v) => set({ abrechnung: v })}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="einmalig">einmalig</SelectItem>
            <SelectItem value="monatlich">monatlich</SelectItem>
            <SelectItem value="nach_aufwand">nach Aufwand</SelectItem>
          </SelectContent>
        </Select>
        {p.optional_im_angebot && <span className="text-[11px] text-muted-foreground">optional im Angebot</span>}
        {onRemove && <Button variant="ghost" size="icon-sm" onClick={onRemove}><Trash2 /></Button>}
      </div>
      {p.beauftragt && (
        <div className="space-y-3 sm:pl-6">
          <PositionModuleSelect value={p.module_choice} modules={modules} onChange={(v) => set({ module_choice: v })} />
          <Feld label="Beschreibung">
            <Textarea value={p.description} onChange={(e) => set({ description: e.target.value })} rows={3}
              className={`text-sm ${ohneBeschreibung ? 'border-amber-400' : ''}`} placeholder="Leistungsbeschreibung laut Angebot" />
          </Feld>
          <Feld label="Lieferumfang (eine Zeile je Leistung)">
            <ListenFeld value={p.lieferumfang} onChange={(v) => set({ lieferumfang: v })} rows={2} />
          </Feld>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Feld label="Korrekturschleifen (leer = wie Auftrag)">
              <Input type="number" min="0" value={p.korrekturschleifen} onChange={(e) => set({ korrekturschleifen: e.target.value })} className="h-8 text-sm" />
            </Feld>
            <Feld label="Dauer">
              <Input value={p.leistungszeitraum} onChange={(e) => set({ leistungszeitraum: e.target.value })} className="h-8 text-sm" />
            </Feld>
          </div>
        </div>
      )}
    </div>
  );
}