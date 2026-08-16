import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Eye, UserCheck } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { SYSTEM_ROLES } from './teamRosterConfig';

const AREAS = [
  { key: 'projects', label: 'Projekte' },
  { key: 'sales', label: 'Sales' },
  { key: 'backoffice', label: 'Backoffice' },
  { key: 'management', label: 'Führung' },
];

// Zuständigkeit je Person aus dem Reiter „Personen" — Führung sieht alles.
export default function TeamScopeSettings() {
  const { toast } = useToast();
  const [savingEmail, setSavingEmail] = useState(null);
  const [drafts, setDrafts] = useState({});

  const { data: members = [], isLoading: lm } = useQuery({
    queryKey: ['team-roster'],
    queryFn: () => base44.entities.TeamMember.list('name', 200),
  });

  const { data: profiles = [], isLoading: lp, refetch } = useQuery({
    queryKey: ['team-profiles'],
    queryFn: () => base44.entities.TeamMemberProfile.list('-created_date', 200),
  });

  const people = members.filter((m) => m.active !== false);
  const profileFor = (email) => profiles.find((p) => p.user_email === email);

  const valueFor = (person, field, fallback) => {
    const d = drafts[person.email];
    if (d && d[field] !== undefined) return d[field];
    const p = profileFor(person.email);
    if (p && p[field] !== undefined && p[field] !== null) return p[field];
    return fallback;
  };

  const setDraft = (email, field, value) =>
    setDrafts((prev) => ({ ...prev, [email]: { ...prev[email], [field]: value } }));

  const defaultScope = (person) => (person.system_role === 'gf' ? 'all' : 'own');
  const defaultAreas = (person) => (person.system_role === 'gf' ? ['projects', 'sales', 'backoffice', 'management'] : ['projects']);

  const save = async (person) => {
    setSavingEmail(person.email);
    const aliasesRaw = valueFor(person, 'pm_aliases', [person.name].filter(Boolean));
    const payload = {
      user_email: person.email,
      display_name: person.name || person.email,
      data_scope: valueFor(person, 'data_scope', defaultScope(person)),
      work_areas: valueFor(person, 'work_areas', defaultAreas(person)),
      pm_aliases: (Array.isArray(aliasesRaw) ? aliasesRaw : String(aliasesRaw).split(','))
        .map((a) => String(a).trim())
        .filter(Boolean),
      is_active: true,
    };
    const existing = profileFor(person.email);
    if (existing) await base44.entities.TeamMemberProfile.update(existing.id, payload);
    else await base44.entities.TeamMemberProfile.create(payload);
    setDrafts((prev) => ({ ...prev, [person.email]: undefined }));
    await refetch();
    setSavingEmail(null);
    toast({ title: 'Zuständigkeit gespeichert', description: payload.display_name });
  };

  if (lm || lp) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-8"><Loader2 className="w-4 h-4 animate-spin" /> Team wird geladen...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Zuständigkeit & Sichtbarkeit</CardTitle>
        <p className="text-xs text-muted-foreground">
          Grundlage sind die Personen aus dem Reiter „Personen". Die Namen hier steuern, welche Projekte
          eine Person in „Mein Tag" als eigene erkennt.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {people.length === 0 && (
          <p className="text-sm text-muted-foreground">Noch keine aktiven Personen angelegt.</p>
        )}
        {people.map((u) => {
          const scope = valueFor(u, 'data_scope', defaultScope(u));
          const areas = valueFor(u, 'work_areas', defaultAreas(u));
          const aliases = valueFor(u, 'pm_aliases', [u.name].filter(Boolean));
          const dirty = !!drafts[u.email];

          return (
            <div key={u.id} className="rounded-xl border p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                    style={{ backgroundColor: u.color || '#33415C' }}
                  >
                    {(u.name || '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{u.name || u.email}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {SYSTEM_ROLES.find((r) => r.key === u.system_role)?.label || u.system_role}
                  </Badge>
                  <Badge className={scope === 'all' ? 'bg-blue-100 text-blue-700 border-0 gap-1' : 'bg-amber-100 text-amber-700 border-0 gap-1'}>
                    {scope === 'all' ? <Eye className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                    {scope === 'all' ? 'Sieht alles' : 'Nur eigene'}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Datensicht</label>
                  <Select value={scope} onValueChange={(v) => setDraft(u.email, 'data_scope', v)}>
                    <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="own">Nur eigene Projekte & Kunden</SelectItem>
                      <SelectItem value="all">Alles sehen (Gesamtsicht)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Name(n) als Projektverantwortliche/r — mit Komma trennen
                  </label>
                  <Input
                    className="h-9 mt-1"
                    value={Array.isArray(aliases) ? aliases.join(', ') : aliases}
                    placeholder="z.B. Sebastian Haslinger, S. Haslinger"
                    onChange={(e) => setDraft(u.email, 'pm_aliases', e.target.value.split(','))}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Aufgabenbereiche</label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {AREAS.map((a) => {
                    const on = areas.includes(a.key);
                    return (
                      <button
                        key={a.key}
                        type="button"
                        onClick={() =>
                          setDraft(u.email, 'work_areas', on ? areas.filter((x) => x !== a.key) : [...areas, a.key])
                        }
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                          on ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        {a.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end">
                <Button size="sm" onClick={() => save(u)} disabled={!dirty || savingEmail === u.email}>
                  {savingEmail === u.email
                    ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Speichern...</>
                    : <><Save className="w-3.5 h-3.5 mr-1" /> Speichern</>}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}