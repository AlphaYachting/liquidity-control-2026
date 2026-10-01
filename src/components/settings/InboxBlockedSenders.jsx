import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Trash2, Plus, Filter } from 'lucide-react';

const MODI = {
  verwaltung: { label: 'Verwaltung', hilfe: 'erscheint im Posteingang unter „Verwaltung“' },
  ausblenden: { label: 'Ausblenden', hilfe: 'erscheint nie im Posteingang (vertraulich)' },
};

// Absender-Regeln des Posteingangs: Lieferanten, Steuerberatung, Behörden unter „Verwaltung“
// abtrennen; vertrauliche Absender ganz ausblenden. Die E-Mail-Zentrale zeigt weiterhin alles.
export default function InboxBlockedSenders() {
  const queryClient = useQueryClient();
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState('verwaltung');
  const [busy, setBusy] = useState(false);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['inbox-blocked-senders'],
    queryFn: () => base44.entities.InboxBlockedSender.list('-created_date', 200),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['inbox-blocked-senders'] });
    queryClient.invalidateQueries({ queryKey: ['posteingang'] });
  };

  const add = async () => {
    const v = value.trim().toLowerCase();
    if (!v) return;
    setBusy(true);
    await base44.entities.InboxBlockedSender.create({ value: v, label: label.trim(), mode, is_active: true });
    setValue(''); setLabel('');
    setBusy(false);
    refresh();
  };

  const remove = async (id) => {
    await base44.entities.InboxBlockedSender.delete(id);
    refresh();
  };

  const changeMode = async (id, m) => {
    await base44.entities.InboxBlockedSender.update(id, { mode: m });
    refresh();
  };

  const sortiert = [...rules].sort((a, b) =>
    String(a.mode || 'ausblenden').localeCompare(String(b.mode || 'ausblenden')) || String(a.value).localeCompare(String(b.value)));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Filter className="w-4 h-4" /> Posteingang: Absender-Regeln
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          <strong>Verwaltung</strong>: Lieferanten, Steuerberatung, Bank, Behörden — erscheinen im Posteingang unter dem eigenen
          Filter „Verwaltung“ und nicht im Zähler. <strong>Ausblenden</strong>: vertrauliche Absender erscheinen nie im Posteingang.
          Eintragen lässt sich eine ganze Adresse (meinanwalt@unseranwalt.at) oder eine Domain (unseranwalt.at).
          Die E-Mail-Zentrale zeigt weiterhin alle Mails.
        </p>

        <div className="flex flex-wrap gap-2">
          <Input value={value} onChange={(e) => setValue(e.target.value)}
            placeholder="Adresse oder Domain" className="h-8 text-xs w-56" />
          <Input value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="Notiz (optional)" className="h-8 text-xs w-48" />
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(MODI).map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 text-xs gap-1" onClick={add} disabled={busy || !value.trim()}>
            <Plus className="w-3.5 h-3.5" /> Hinzufügen
          </Button>
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Lädt…</p>
        ) : rules.length === 0 ? (
          <p className="text-xs text-muted-foreground">Noch keine Regel eingetragen.</p>
        ) : (
          <div className="divide-y border rounded-lg">
            {sortiert.map((r) => {
              const m = r.mode || 'ausblenden';
              return (
                <div key={r.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="text-xs font-medium">{r.value}</span>
                  {r.label && <span className="text-xs text-muted-foreground truncate">· {r.label}</span>}
                  <span className="ml-auto" />
                  <Select value={m} onValueChange={(v) => changeMode(r.id, v)}>
                    <SelectTrigger className="h-7 text-xs w-32" title={MODI[m]?.hilfe}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(MODI).map(([k, mm]) => <SelectItem key={k} value={k}>{mm.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    title="Entfernen" onClick={() => remove(r.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
