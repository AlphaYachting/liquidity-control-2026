import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PROJECT_TYPES, PROJECT_TYPE_ORDER } from '@/components/sprint/projectTypes';

export const NEW_CLIENT = '__new__';

// Prüft, ob der Rahmen vollständig ist — Grundlage für „Weiter"
export function rahmenValid(seed) {
  const clientOk = seed.client_id === NEW_CLIENT
    ? Boolean(seed.new_client_name?.trim())
    : Boolean(seed.client_id);
  const sprintOk = seed.type !== 'sprint' || seed.sprint_target === 'neu' || Boolean(seed.existing_project_id);
  return clientOk && Boolean(seed.type) && Boolean(seed.pm_email) && Boolean(seed.title?.trim()) && sprintOk;
}

// Schritt 1 — Rahmen für alle Projekttypen. Füllt den Startkeim, aus dem alle
// weiteren Schritte lesen.
export default function StepRahmen({ seed, setSeed, clients = [], members = [], projects = [] }) {
  const set = (patch) => setSeed((s) => ({ ...s, ...patch }));
  const clientProjects = projects.filter((p) => p.client_id === seed.client_id);

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <Label>Kunde *</Label>
        <Select value={seed.client_id} onValueChange={(v) => set({ client_id: v, existing_project_id: '' })}>
          <SelectTrigger><SelectValue placeholder="Kunde wählen" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NEW_CLIENT}>＋ neuer Kunde</SelectItem>
            {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {seed.client_id === NEW_CLIENT && (
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <div>
              <Label>Name *</Label>
              <Input value={seed.new_client_name || ''} onChange={(e) => set({ new_client_name: e.target.value })} />
            </div>
            <div>
              <Label>E-Mail</Label>
              <Input type="email" value={seed.new_client_email || ''} onChange={(e) => set({ new_client_email: e.target.value })} />
            </div>
          </div>
        )}
      </div>

      <div>
        <Label>Projekttyp *</Label>
        <Select value={seed.type} onValueChange={(v) => set({ type: v })}>
          <SelectTrigger><SelectValue placeholder="Typ wählen" /></SelectTrigger>
          <SelectContent>
            {PROJECT_TYPE_ORDER.map((k) => <SelectItem key={k} value={k}>{PROJECT_TYPES[k].label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Projektmanager *</Label>
        <Select value={seed.pm_email} onValueChange={(v) => set({ pm_email: v })}>
          <SelectTrigger><SelectValue placeholder="Projektmanager wählen" /></SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.email}>{m.name || m.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Projekttitel *</Label>
        <Input value={seed.title || ''} onChange={(e) => set({ title: e.target.value })} />
      </div>

      {seed.type === 'sprint' && (
        <div className="space-y-3 rounded border border-muted p-4">
          <div className="flex flex-wrap gap-4">
            {[
              { value: 'neu', label: 'Neues Projekt' },
              { value: 'folge', label: 'Folgesprint zu bestehendem Projekt' },
            ].map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio" name="sprint_target" value={o.value}
                  checked={(seed.sprint_target || 'neu') === o.value}
                  onChange={() => set({ sprint_target: o.value })}
                />
                {o.label}
              </label>
            ))}
          </div>
          {seed.sprint_target === 'folge' && (
            <div>
              <Label>Bestehendes Projekt *</Label>
              <Select value={seed.existing_project_id || ''} onValueChange={(v) => set({ existing_project_id: v })}>
                <SelectTrigger><SelectValue placeholder="Projekt des Kunden wählen" /></SelectTrigger>
                <SelectContent>
                  {clientProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                </SelectContent>
              </Select>
              {clientProjects.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">Für diesen Kunden gibt es noch kein Projekt.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}