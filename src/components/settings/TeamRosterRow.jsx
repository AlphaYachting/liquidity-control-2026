import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Check } from 'lucide-react';
import { PERSON_COLORS, SYSTEM_ROLES, TICKET_ROLES } from './teamRosterConfig';

// Eine Person: Stammdaten, Fachrollen und Personenfarbe
export default function TeamRosterRow({ member, onSave }) {
  const [draft, setDraft] = useState(member);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(member);

  const set = (field, value) => setDraft((d) => ({ ...d, [field]: value }));
  const toggleRole = (r) =>
    set('roles', (draft.roles || []).includes(r)
      ? draft.roles.filter((x) => x !== r)
      : [...(draft.roles || []), r]);

  const save = async () => {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
  };

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span
            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
            style={{ backgroundColor: draft.color || '#33415C' }}
          >
            {(draft.name || '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
          </span>
          <div>
            <p className="text-sm font-semibold">{draft.name || 'Neue Person'}</p>
            <p className="text-xs text-muted-foreground">{draft.email || 'E-Mail offen'}</p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {SYSTEM_ROLES.find((r) => r.key === draft.system_role)?.label || draft.system_role}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Name</label>
          <Input className="h-9 mt-1" value={draft.name || ''} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">E-Mail</label>
          <Input className="h-9 mt-1" value={draft.email || ''} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Systemrolle</label>
          <Select value={draft.system_role} onValueChange={(v) => set('system_role', v)}>
            <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SYSTEM_ROLES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">Fachrollen</label>
        <div className="flex flex-wrap gap-2 mt-1.5">
          {TICKET_ROLES.map((r) => {
            const on = (draft.roles || []).includes(r);
            return (
              <button
                key={r} type="button" onClick={() => toggleRole(r)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  on ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-accent'
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Eigene Farbe</label>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {PERSON_COLORS.map((c) => (
              <button
                key={c.hex} type="button" title={c.label} onClick={() => set('color', c.hex)}
                className="w-7 h-7 rounded-full flex items-center justify-center border-2"
                style={{ backgroundColor: c.hex, borderColor: draft.color === c.hex ? '#111' : 'transparent' }}
              >
                {draft.color === c.hex && <Check className="w-3.5 h-3.5 text-white" />}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Focus-Tage / Woche</label>
            <Input
              type="number" className="h-9 mt-1 w-28"
              value={draft.weekly_focus_days ?? 4}
              onChange={(e) => set('weekly_focus_days', Number(e.target.value))}
            />
          </div>
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving
              ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Speichern...</>
              : <><Save className="w-3.5 h-3.5 mr-1" /> Speichern</>}
          </Button>
        </div>
      </div>
    </div>
  );
}